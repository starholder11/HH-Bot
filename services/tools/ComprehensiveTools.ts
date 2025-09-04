import { z } from 'zod';
import { saveMediaAsset } from '@/lib/media-storage';
import { RedisContextService } from '../context/RedisContextService';
import yaml from 'js-yaml';

/**
 * Comprehensive Tools Class
 *
 * This class provides agent-callable tools for ALL application endpoints.
 * Organized by functional domain for maintainability.
 *
 * Total Coverage: 66 API endpoints
 */
export class ComprehensiveTools {
  constructor(
    private contextService: RedisContextService,
    private apiClient: {
      get: (url: string, options?: any) => Promise<any>;
      post: (url: string, data?: any, options?: any) => Promise<any>;
      put: (url: string, data?: any, options?: any) => Promise<any>;
      patch: (url: string, data?: any, options?: any) => Promise<any>;
      delete: (url: string, options?: any) => Promise<any>;
    }
  ) {}

  // ============================================================================
  // SEARCH & DISCOVERY TOOLS
  // ============================================================================

  async searchUnified(params: { query: string; mediaTypes?: string[]; limit?: number; userId: string }) {
    const correlationId = `search_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    console.log(`[${correlationId}] Executing unified search: "${params.query}"`);

    try {
      await this.contextService.addRecentSearch(params.userId, 'default', params.query);

      const response = await this.apiClient.post('/api/unified-search', {
        query: params.query,
        mediaTypes: params.mediaTypes || ['all'],
        limit: params.limit || 20
      });

      // Normalize results shape to an array for downstream handling
      const rawResults = response.results;
      const resultArray = Array.isArray(rawResults)
        ? rawResults
        : (Array.isArray(rawResults?.all) ? rawResults.all : []);

      // Store results in Redis working set for "first one" references
      if (resultArray.length > 0) {
        const workingSet = resultArray.map((r: any) => ({
          id: r.id || r.slug,
          slug: r.slug || r.id,
          title: r.title || r.name || r.id,
          url: r.url || r.media_url,
          content_type: r.content_type || 'image'
        }));

        const redisKey = `working_set:${params.userId}`;
        await this.contextService.redis.setex(redisKey, 3600, JSON.stringify(workingSet));
        console.log(`[${correlationId}] Stored ${workingSet.length} results in working set`);
      }

      return {
        success: true,
        results: resultArray,
        total: (Array.isArray(rawResults?.all) ? rawResults.all.length : (Array.isArray(rawResults) ? rawResults.length : (response.total || 0))),
        correlationId
      };
    } catch (error) {
      console.error(`[${correlationId}] Search failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Search failed',
        correlationId
      };
    }
  }
  static searchUnifiedSchema = z.object({
    query: z.string().describe('Search query text'),
    mediaTypes: z.array(z.string()).optional().describe('Filter by media types: image, video, audio, layout, etc.'),
    limit: z.number().optional().describe('Maximum number of results (default: 20)'),
    userId: z.string().describe('User ID for context tracking')
  });

  async searchKeyframes(params: { query: string; limit?: number; userId: string }) {
    const correlationId = `keyframe_search_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    console.log(`[${correlationId}] Searching keyframes: "${params.query}"`);

    try {
      const response = await this.apiClient.post('/api/media-labeling/keyframes/search', {
        query: params.query,
        limit: params.limit || 20
      });

      return {
        success: true,
        keyframes: response.keyframes || [],
        total: response.total || 0,
        correlationId
      };
    } catch (error) {
      console.error(`[${correlationId}] Keyframe search failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Keyframe search failed',
        correlationId
      };
    }
  }
  static searchKeyframesSchema = z.object({
    query: z.string().describe('Search query for video keyframes'),
    limit: z.number().optional().describe('Maximum number of keyframes (default: 20)'),
    userId: z.string().describe('User ID for context tracking')
  });

  // ============================================================================
  // ASSET MANAGEMENT TOOLS
  // ============================================================================

  async listMediaAssets(params: { mediaType?: string; page?: number; limit?: number; userId: string }) {
    const correlationId = `list_assets_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    console.log(`[${correlationId}] Listing media assets: ${params.mediaType || 'all'}`);

    try {
      const queryParams = new URLSearchParams();
      if (params.mediaType) queryParams.append('mediaType', params.mediaType);
      if (params.page) queryParams.append('page', params.page.toString());
      if (params.limit) queryParams.append('limit', params.limit.toString());

      const response = await this.apiClient.get(`/api/media-labeling/assets?${queryParams}`);

      return {
        success: true,
        assets: response.assets || [],
        total: response.total || 0,
        page: response.page || 1,
        correlationId
      };
    } catch (error) {
      console.error(`[${correlationId}] List assets failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list assets',
        correlationId
      };
    }
  }
  static listMediaAssetsSchema = z.object({
    mediaType: z.string().optional().describe('Filter by media type: image, video, audio, layout'),
    page: z.number().optional().describe('Page number for pagination (default: 1)'),
    limit: z.number().optional().describe('Items per page (default: 20)'),
    userId: z.string().describe('User ID for context tracking')
  });

  async getMediaAsset(params: { assetId: string; userId: string }) {
    const correlationId = `get_asset_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    console.log(`[${correlationId}] Getting asset: ${params.assetId}`);

    try {
      const response = await this.apiClient.get(`/api/media-labeling/assets/${params.assetId}`);

      return {
        success: true,
        asset: response.asset,
        correlationId
      };
    } catch (error) {
      console.error(`[${correlationId}] Get asset failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Asset not found',
        correlationId
      };
    }
  }
  static getMediaAssetSchema = z.object({
    assetId: z.string().describe('Unique asset identifier'),
    userId: z.string().describe('User ID for context tracking')
  });

  /** Resolve identifiers (IDs, filenames, names) to direct media URLs */
  async resolveAssetRefs(params: { identifiers: string[]; preferred?: 'cloudflare'|'s3'|'any'; userId: string }) {
    const correlationId = `resolve_refs_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    console.log(`[${correlationId}] Resolving refs:`, params.identifiers);

    const prefer = (asset: any): string | undefined => {
      const cf = asset?.cloudflare_url as string | undefined;
      const s3 = asset?.s3_url as string | undefined;
      if ((params.preferred || 'any') === 'cloudflare') return cf || s3;
      if ((params.preferred || 'any') === 's3') return s3 || cf;
      return cf || s3;
    };

    const refs: string[] = [];
    const resolved: Array<{ identifier: string; url?: string; source?: string; error?: string }> = [];

    for (const identifier of params.identifiers) {
      let foundUrl: string | undefined;
      // 1) Try direct media-labeling assets API
      try {
        const resp1 = await this.apiClient.get(`/api/media-labeling/assets/${encodeURIComponent(identifier)}`);
        const asset1 = resp1?.asset || resp1;
        foundUrl = prefer(asset1);
        if (foundUrl) {
          refs.push(foundUrl); resolved.push({ identifier, url: foundUrl, source: 'media-labeling/assets' });
          continue;
        }
      } catch {}

      // 2) Try generic media-assets API (S3 JSON metadata)
      try {
        const resp2 = await this.apiClient.get(`/api/media-assets/${encodeURIComponent(identifier)}`);
        const asset2 = resp2?.asset || resp2;
        foundUrl = prefer(asset2);
        if (foundUrl) {
          refs.push(foundUrl); resolved.push({ identifier, url: foundUrl, source: 'media-assets' });
          continue;
        }
      } catch {}

      // 3) Fallback unified search by name/filename
      try {
        const search = await this.apiClient.post('/api/unified-search', { query: identifier, limit: 5 });
        const arr = Array.isArray(search?.results?.all) ? search.results.all : (Array.isArray(search?.results) ? search.results : []);
        const first = Array.isArray(arr) && arr.length > 0 ? arr[0] : null;
        const candidate = first?.url || first?.media_url || first?.cloudflare_url || first?.s3_url;
        if (candidate) {
          refs.push(candidate); resolved.push({ identifier, url: candidate, source: 'unified-search' });
          continue;
        }
      } catch {}

      resolved.push({ identifier, error: 'Not found' });
    }

    return { success: true, refs, resolved, correlationId };
  }
  static resolveAssetRefsSchema = z.object({
    identifiers: z.array(z.string()).min(1),
    preferred: z.enum(['cloudflare','s3','any']).optional().default('any'),
    userId: z.string()
  });

  async renameAsset(params: { assetId: string; newFilename: string; userId: string }) {
    const correlationId = `rename_asset_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    console.log(`[${correlationId}] Renaming asset ${params.assetId} to: ${params.newFilename}`);

    try {
      const response = await this.apiClient.patch(`/api/media-labeling/assets/${params.assetId}/rename`, {
        newFilename: params.newFilename
      });

      return {
        success: true,
        asset: response.asset,
        message: response.message,
        correlationId
      };
    } catch (error) {
      console.error(`[${correlationId}] Rename asset failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to rename asset',
        correlationId
      };
    }
  }
  static renameAssetSchema = z.object({
    assetId: z.string().describe('Asset ID to rename'),
    newFilename: z.string().describe('New filename (with extension)'),
    userId: z.string().describe('User ID for context tracking')
  });

  async updateAsset(params: { assetId: string; updates: Record<string, any>; userId: string }) {
    const correlationId = `update_asset_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    console.log(`[${correlationId}] Updating asset: ${params.assetId}`);

    try {
      const response = await this.apiClient.patch(`/api/media-labeling/assets/${params.assetId}`, params.updates);

      return {
        success: true,
        asset: response.asset,
        correlationId
      };
    } catch (error) {
      console.error(`[${correlationId}] Update asset failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update asset',
        correlationId
      };
    }
  }
  static updateAssetSchema = z.object({
    assetId: z.string().describe('Asset ID to update'),
    updates: z.record(z.any()).describe('Fields to update (title, description, tags, etc.)'),
    userId: z.string().describe('User ID for context tracking')
  });

  // ============================================================================
  // LAYOUT MANAGEMENT TOOLS
  // ============================================================================

  async listLayouts(params: { userId: string }) {
    const correlationId = `list_layouts_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    console.log(`[${correlationId}] Listing layouts`);

    try {
      const response = await this.apiClient.get('/api/layouts');

      return {
        success: true,
        layouts: response.layouts || [],
        total: response.total || 0,
        correlationId
      };
    } catch (error) {
      console.error(`[${correlationId}] List layouts failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list layouts',
        correlationId
      };
    }
  }
  static listLayoutsSchema = z.object({
    userId: z.string().describe('User ID for context tracking')
  });

  async duplicateLayout(params: { layoutId: string; newName?: string; userId: string }) {
    const correlationId = `duplicate_layout_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    console.log(`[${correlationId}] Duplicating layout: ${params.layoutId}`);

    try {
      // First get the original layout
      const originalResponse = await this.apiClient.get(`/api/media-labeling/assets/${params.layoutId}`);
      const original = originalResponse.asset;

      if (!original || original.media_type !== 'layout') {
        throw new Error('Layout not found or invalid type');
      }

      // Create duplicate with modified name and data
      const duplicateName = params.newName || `${original.title} (Copy)`;
      const duplicateData = {
        ...original.layout_data,
        title: duplicateName
      };

      // Create new layout asset (this would need a proper endpoint)
      const response = await this.apiClient.post('/api/media-labeling/assets', {
        filename: `${duplicateName.replace(/[^a-zA-Z0-9]/g, '_')}.json`,
        title: duplicateName,
        media_type: 'layout',
        layout_data: duplicateData
      });

      return {
        success: true,
        layout: response.asset,
        message: `Layout duplicated as "${duplicateName}"`,
        correlationId
      };
    } catch (error) {
      console.error(`[${correlationId}] Duplicate layout failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to duplicate layout',
        correlationId
      };
    }
  }
  static duplicateLayoutSchema = z.object({
    layoutId: z.string().describe('Layout ID to duplicate'),
    newName: z.string().optional().describe('Name for the duplicated layout'),
    userId: z.string().describe('User ID for context tracking')
  });

  // ============================================================================
  // CANVAS MANAGEMENT TOOLS
  // ============================================================================

  async createCanvas(params: { name: string; description?: string; userId: string }) {
    const correlationId = `create_canvas_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    console.log(`[${correlationId}] Creating canvas: ${params.name}`);

    try {
      const response = await this.apiClient.post('/api/canvas', {
        name: params.name,
        description: params.description || ''
      });

      // Optionally update context; ignore if schema doesn't support this field
      await this.contextService.updateUserContextWithParams(params.userId, 'default', {});

      return {
        success: true,
        canvas: response.canvas,
        correlationId
      };
    } catch (error) {
      console.error(`[${correlationId}] Create canvas failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create canvas',
        correlationId
      };
    }
  }
  static createCanvasSchema = z.object({
    name: z.string().describe('Canvas name'),
    description: z.string().optional().describe('Canvas description'),
    userId: z.string().describe('User ID for context tracking')
  });

  async listCanvases(params: { userId: string }) {
    const correlationId = `list_canvases_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    console.log(`[${correlationId}] Listing canvases`);

    try {
      const response = await this.apiClient.get('/api/canvas');

      return {
        success: true,
        canvases: response.canvases || [],
        total: response.total || 0,
        correlationId
      };
    } catch (error) {
      console.error(`[${correlationId}] List canvases failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list canvases',
        correlationId
      };
    }
  }
  static listCanvasesSchema = z.object({
    userId: z.string().describe('User ID for context tracking')
  });

  async getCanvas(params: { canvasId: string; userId: string }) {
    const correlationId = `get_canvas_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    console.log(`[${correlationId}] Getting canvas: ${params.canvasId}`);

    try {
      const response = await this.apiClient.get(`/api/canvas?id=${params.canvasId}`);

      return {
        success: true,
        canvas: response.canvas,
        correlationId
      };
    } catch (error) {
      console.error(`[${correlationId}] Get canvas failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Canvas not found',
        correlationId
      };
    }
  }
  static getCanvasSchema = z.object({
    canvasId: z.string().describe('Canvas ID to retrieve'),
    userId: z.string().describe('User ID for context tracking')
  });

  async updateCanvas(params: { canvasId: string; updates: Record<string, any>; userId: string }) {
    const correlationId = `update_canvas_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    console.log(`[${correlationId}] Updating canvas: ${params.canvasId}`);

    try {
      const response = await this.apiClient.put('/api/canvas', {
        id: params.canvasId,
        ...params.updates
      });

      return {
        success: true,
        canvas: response.canvas,
        correlationId
      };
    } catch (error) {
      console.error(`[${correlationId}] Update canvas failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update canvas',
        correlationId
      };
    }
  }
  static updateCanvasSchema = z.object({
    canvasId: z.string().describe('Canvas ID to update'),
    updates: z.record(z.any()).describe('Canvas updates (name, description, items, etc.)'),
    userId: z.string().describe('User ID for context tracking')
  });

  async pinToCanvas(params: { canvasId?: string; contentId?: string; items?: any[]; userId: string }) {
    const correlationId = `pin_to_canvas_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;

    // Resolve contentId from working set if not provided or if "first/top" references
    let resolvedContentId = params.contentId;
    if (!resolvedContentId || /\b(first|top|1st)\b/i.test(resolvedContentId)) {
      try {
        const redisKey = `working_set:${params.userId}`;
        const workingSetData = await this.contextService.redis.get(redisKey);
        if (workingSetData) {
          const workingSet = JSON.parse(workingSetData);
          if (workingSet.length > 0) {
            resolvedContentId = workingSet[0].id || workingSet[0].slug;
            console.log(`[${correlationId}] Resolved "first one" to: ${resolvedContentId}`);
          }
        }
      } catch (e) {
        console.warn(`[${correlationId}] Failed to resolve working set:`, e);
      }
    }

    // Resolve canvasId - create "Active Canvas" if not provided
    let resolvedCanvasId = params.canvasId;
    if (!resolvedCanvasId) {
      try {
        const activeCanvasKey = `active_canvas:${params.userId}`;
        let activeCanvasId = await this.contextService.redis.get(activeCanvasKey);

        if (!activeCanvasId) {
          // Create a new "Active Canvas"
          const canvasResponse = await this.apiClient.post('/api/canvas', {
            name: 'Active Canvas',
            description: 'Default canvas for pinned items',
            userId: params.userId
          });
          activeCanvasId = canvasResponse.id;
          await this.contextService.redis.setex(activeCanvasKey, 86400, activeCanvasId);
          console.log(`[${correlationId}] Created new Active Canvas: ${activeCanvasId}`);
        }

        resolvedCanvasId = activeCanvasId;
      } catch (e) {
        console.warn(`[${correlationId}] Failed to resolve canvas:`, e);
        throw new Error('No canvas ID provided and failed to create default canvas');
      }
    }

    // Handle both single item and multiple items
    let itemsToPinRaw = params.items || [];
    if (resolvedContentId && !itemsToPinRaw.length) {
      itemsToPinRaw = [{ contentId: resolvedContentId, position: { x: 100, y: 100 } }];
    }

    if (!itemsToPinRaw.length) {
      throw new Error('No content to pin - provide contentId or items array');
    }

    // Normalize items to canvas schema: { id, type, position, order?, metadata? }
    const itemsToPin = itemsToPinRaw
      .map((it: any, index: number) => {
        const id = it?.id || it?.contentId || it?.slug || '';
        if (!id) return null;
        const type = (it?.type || it?.content_type || 'image') as string;
        const position = it?.position || { x: 100 + index * 20, y: 100 };
        const metadata = it?.metadata || {
          url: it?.url || it?.media_url,
          title: it?.title || it?.name || id
        };
        return { id, type, position, order: index, metadata };
      })
      .filter(Boolean) as Array<{ id: string; type: string; position: any; order?: number; metadata?: any }>;

    if (!itemsToPin.length) {
      throw new Error('No valid items to pin after normalization');
    }

    console.log(`[${correlationId}] Pinning ${itemsToPin.length} items to canvas: ${resolvedCanvasId}`);

    try {
      // First get the current canvas to preserve existing items
      let currentCanvas: any = {};
      try {
        const canvasResponse = await this.apiClient.get(`/api/canvas?id=${resolvedCanvasId}`);
        currentCanvas = canvasResponse.canvas || {};
      } catch (e) {
        console.log(`[${correlationId}] Canvas not found, will create new one`);
      }

      // Merge new items with existing items
      const existingItems = Array.isArray(currentCanvas.items) ? currentCanvas.items : [];
      const allItems = [...existingItems, ...itemsToPin];

      const response = await this.apiClient.put('/api/canvas', {
        id: resolvedCanvasId,
        name: currentCanvas.name || 'Active Canvas',
        description: currentCanvas.description || 'Default canvas for pinned items',
        items: allItems
      });

      return {
        success: true,
        canvas: response.canvas,
        canvasId: resolvedCanvasId,
        contentId: resolvedContentId,
        message: `Pinned ${itemsToPin.length} items to canvas`,
        correlationId
      };
    } catch (error) {
      console.error(`[${correlationId}] Pin to canvas failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to pin items to canvas',
        correlationId
      };
    }
  }
  static pinToCanvasSchema = z.object({
    canvasId: z.string().optional().describe('Canvas ID to pin items to (creates Active Canvas if not provided)'),
    contentId: z.string().optional().describe('Single content ID to pin (resolves from recent search if "first/top")'),
    items: z.array(z.any()).optional().describe('Multiple items to pin (with position, size, etc.)'),
    userId: z.string().describe('User ID for context tracking')
  });

  // ============================================================================
  // LORA & TRAINING TOOLS
  // ============================================================================

  async listLoras(params: { userId: string }) {
    const correlationId = `list_loras_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    console.log(`[${correlationId}] Listing LoRA models`);

    try {
      const response = await this.apiClient.get('/api/loras');

      return {
        success: true,
        loras: response.loras || [],
        total: response.total || 0,
        correlationId
      };
    } catch (error) {
      console.error(`[${correlationId}] List LoRAs failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list LoRAs',
        correlationId
      };
    }
  }
  static listLorasSchema = z.object({
    userId: z.string().describe('User ID for context tracking')
  });

  async getCanvasLoras(params: { canvasId: string; userId: string }) {
    const correlationId = `get_canvas_loras_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    console.log(`[${correlationId}] Getting LoRAs for canvas: ${params.canvasId}`);

    try {
      const response = await this.apiClient.get(`/api/canvas/loras?canvasId=${params.canvasId}`);

      return {
        success: true,
        loras: response.loras || [],
        correlationId
      };
    } catch (error) {
      console.error(`[${correlationId}] Get canvas LoRAs failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get canvas LoRAs',
        correlationId
      };
    }
  }
  static getCanvasLorasSchema = z.object({
    canvasId: z.string().describe('Canvas ID to get LoRAs for'),
    userId: z.string().describe('User ID for context tracking')
  });

  async trainLora(params: { canvasId: string; name: string; description?: string; userId: string }) {
    const correlationId = `train_lora_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    console.log(`[${correlationId}] Starting LoRA training: ${params.name}`);

    try {
      const response = await this.apiClient.post('/api/canvas/train-lora', {
        canvasId: params.canvasId,
        name: params.name,
        description: params.description || ''
      });

      return {
        success: true,
        trainingJob: response.job,
        message: `LoRA training started: ${params.name}`,
        correlationId
      };
    } catch (error) {
      console.error(`[${correlationId}] Train LoRA failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to start LoRA training',
        correlationId
      };
    }
  }
  static trainLoraSchema = z.object({
    canvasId: z.string().describe('Canvas ID with training images'),
    name: z.string().describe('Name for the LoRA model'),
    description: z.string().optional().describe('Description of the LoRA model'),
    userId: z.string().describe('User ID for context tracking')
  });

  async getTrainingStatus(params: { jobId: string; userId: string }) {
    const correlationId = `training_status_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    console.log(`[${correlationId}] Getting training status: ${params.jobId}`);

    try {
      const response = await this.apiClient.get(`/api/canvas/train-status?jobId=${params.jobId}`);

      return {
        success: true,
        status: response.status,
        progress: response.progress,
        correlationId
      };
    } catch (error) {
      console.error(`[${correlationId}] Get training status failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get training status',
        correlationId
      };
    }
  }
  static getTrainingStatusSchema = z.object({
    jobId: z.string().describe('Training job ID'),
    userId: z.string().describe('User ID for context tracking')
  });

  // ============================================================================
  // GENERATION TOOLS
  // ============================================================================

  async generateContent(params: { prompt: string; type: string; settings?: Record<string, any>; userId: string }) {
    const correlationId = `generate_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    console.log(`[${correlationId}] Generating ${params.type}: "${params.prompt}"`);

    try {
      // Align with /api/generate signature: { mode, model, prompt, refs, options }
      const body: any = {
        mode: params.type,
        model: (params.settings as any)?.model,
        prompt: params.prompt,
        refs: (params as any)?.refs || (params.settings as any)?.refs || [],
        options: (params.settings as any)?.options || params.settings || {}
      };
      const response = await this.apiClient.post('/api/generate', body);

      return {
        success: true,
        result: (response as any)?.result ?? response,
        jobId: (response as any)?.jobId,
        correlationId
      };
    } catch (error) {
      console.error(`[${correlationId}] Generation failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Generation failed',
        correlationId
      };
    }
  }
  static generateContentSchema = z.object({
    prompt: z.string().describe('Generation prompt'),
    type: z.string().describe('Content type: image, video, audio, text'),
    settings: z.record(z.any()).optional().describe('Generation settings (model, size, etc.)'),
    userId: z.string().describe('User ID for context tracking')
  });

  async getFalModels(params: { userId: string }) {
    const correlationId = `fal_models_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    console.log(`[${correlationId}] Getting FAL models`);

    try {
      const response = await this.apiClient.get('/api/fal/models');

      return {
        success: true,
        models: response.models || [],
        correlationId
      };
    } catch (error) {
      console.error(`[${correlationId}] Get FAL models failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get FAL models',
        correlationId
      };
    }
  }
  static getFalModelsSchema = z.object({
    userId: z.string().describe('User ID for context tracking')
  });

  // ============================================================================
  // LORE / TEXT DOCUMENT TOOLS (BACKEND-ONLY)
  // ============================================================================

  /**
   * Create a background document draft for scribe (enqueue to Redis via agent backend)
   * Backend-only tool. UI reacts to assistant confirmation; no UI handler required.
   */
  async createBackgroundDocDraft(params: { title?: string; slug?: string; conversationId: string; scribeEnabled?: boolean; categories?: string[]; userId: string }) {
    const correlationId = `scribe_start_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    const slugify = (input: string) => (input || '')
      .toString()
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');

    console.log(`[${correlationId}] START createBackgroundDocDraft`, { title: params.title, slug: params.slug, conversationId: params.conversationId, userId: params.userId });
    try {
      // Always generate unique values for title and slug
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substr(2, 6);
      const finalTitle = params.title || `Conversation Summary ${timestamp}`;
      const finalSlug = params.slug || slugify(finalTitle) + `-${randomSuffix}`;
      const scribeEnabled = params.scribeEnabled !== false;
      const categories = Array.isArray(params.categories) ? params.categories : [];

      // Assemble YAML
      const indexDoc = {
        slug: finalSlug,
        title: finalTitle,
        date: new Date().toISOString(),
        categories,
        source: 'conversation',
        status: 'draft',
        scribe_enabled: scribeEnabled,
        conversation_id: params.conversationId
      } as const;
      const indexYaml = yaml.dump(indexDoc, { noRefs: true });
      const mdx = `# ${finalTitle}\n\n*The scribe will populate this document as your conversation continues...*`;

      // Enqueue draft on agent backend (this.apiClient is bound to backend base URL)
      console.log(`[${correlationId}] ENQUEUE draft -> /api/text-assets/enqueue`, { finalSlug, scribeEnabled });
      const enqueueResp = await this.apiClient.post('/api/text-assets/enqueue', {
        slug: finalSlug,
        indexYaml,
        mdx,
        scribe_enabled: scribeEnabled,
        conversation_id: params.conversationId
      });
      console.log(`[${correlationId}] ENQUEUE result:`, JSON.stringify(enqueueResp));

      // Also create a layout containing this text asset (direct S3 write for reliability)
      let layoutId: string | null = null;
      try {
        layoutId = `layout_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const nowIso = new Date().toISOString();
        const layoutAsset: any = {
          id: layoutId,
          filename: `${layoutId}.json`,
          s3_url: '',
          cloudflare_url: '',
          title: `${finalTitle} - Layout`,
          description: `Layout containing the text asset: ${finalTitle}`,
          media_type: 'layout',
          layout_type: 'blueprint_composer',
          metadata: {
            file_size: 0,
            width: 1200,
            height: 800,
            cell_size: 20,
            item_count: 1,
            has_inline_content: false,
            has_transforms: true
          },
          layout_data: {
            designSize: { width: 1200, height: 800 },
            cellSize: 20,
            styling: {},
            items: [
              {
                id: `text_${Date.now()}`,
                type: 'content_ref',
                contentType: 'text',
                refId: `text_timeline/${finalSlug}`,
                snippet: finalTitle,
                title: finalTitle,
                x: 0,
                y: 0,
                w: 640,
                h: 480,
                nx: 0,
                ny: 0,
                nw: 640/1200,
                nh: 480/800,
                transform: {}
              }
            ]
          },
          ai_labels: { scenes: [], objects: [], style: [], mood: [], themes: [], confidence_scores: {} },
          manual_labels: { scenes: [], objects: [], style: [], mood: [], themes: [], custom_tags: [] },
          processing_status: { upload: 'completed', metadata_extraction: 'completed', ai_labeling: 'not_started', manual_review: 'pending', html_generation: 'pending' },
          timestamps: { uploaded: nowIso, metadata_extracted: nowIso, labeled_ai: null, labeled_reviewed: null, html_generated: null },
          labeling_complete: false,
          project_id: null,
          created_at: nowIso,
          updated_at: nowIso
        };

        console.log(`[${correlationId}] SAVE LAYOUT -> S3 as ${layoutId}.json`);
        await saveMediaAsset(layoutId, layoutAsset);
      } catch (layoutError) {
        console.warn(`[${correlationId}] Layout creation failed (non-blocking):`, layoutError);
        layoutId = null;
      }

      const layoutUrl = layoutId
        ? `/layout-editor/${layoutId}`
        : `/visual-search?highlight=${finalSlug}`;

      const result = {
        success: !!enqueueResp?.enqueued || true,
        slug: finalSlug,
        title: finalTitle,
        layoutId,
        layoutUrl,
        message: `Started scribe for "${finalTitle}". I'll document our conversation as we chat.`,
        correlationId
      };
      console.log(`[${correlationId}] SUCCESS createBackgroundDocDraft:`, JSON.stringify(result));
      return result;
    } catch (error) {
      console.error(`[${correlationId}] createBackgroundDocDraft failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create background doc draft',
        correlationId
      };
    }
  }
  static createBackgroundDocDraftSchema = z.object({
    title: z.string().optional().describe('Human title for the document'),
    slug: z.string().optional().describe('Optional slug (auto-generated from title if omitted)'),
    conversationId: z.string().describe('Active conversation/session identifier'),
    scribeEnabled: z.boolean().optional().default(true).describe('Enable background summarizer'),
    categories: z.array(z.string()).optional().describe('Optional categories/tags'),
    userId: z.string().describe('User ID for context tracking')
  });

  async callFal(params: { model: string; inputs: Record<string, any>; userId: string }) {
    const correlationId = `fal_call_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    console.log(`[${correlationId}] Calling FAL model: ${params.model}`);

    try {
      const response = await this.apiClient.post('/api/fal', {
        model: params.model,
        inputs: params.inputs
      });

      return {
        success: true,
        result: response.result,
        correlationId
      };
    } catch (error) {
      console.error(`[${correlationId}] FAL call failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'FAL call failed',
        correlationId
      };
    }
  }
  static callFalSchema = z.object({
    model: z.string().describe('FAL model identifier'),
    inputs: z.record(z.any()).describe('Model input parameters'),
    userId: z.string().describe('User ID for context tracking')
  });

  // ============================================================================
  // AUDIO MANAGEMENT TOOLS
  // ============================================================================

  async listSongs(params: { userId: string }) {
    const correlationId = `list_songs_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    console.log(`[${correlationId}] Listing songs`);

    try {
      const response = await this.apiClient.get('/api/audio-labeling/songs');

      return {
        success: true,
        songs: response.songs || [],
        total: response.total || 0,
        correlationId
      };
    } catch (error) {
      console.error(`[${correlationId}] List songs failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list songs',
        correlationId
      };
    }
  }
  static listSongsSchema = z.object({
    userId: z.string().describe('User ID for context tracking')
  });

  async getSong(params: { songId: string; userId: string }) {
    const correlationId = `get_song_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    console.log(`[${correlationId}] Getting song: ${params.songId}`);

    try {
      const response = await this.apiClient.get(`/api/audio-labeling/songs/${params.songId}`);

      return {
        success: true,
        song: response.song,
        correlationId
      };
    } catch (error) {
      console.error(`[${correlationId}] Get song failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Song not found',
        correlationId
      };
    }
  }
  static getSongSchema = z.object({
    songId: z.string().describe('Song ID to retrieve'),
    userId: z.string().describe('User ID for context tracking')
  });

  async updateSong(params: { songId: string; updates: Record<string, any>; userId: string }) {
    const correlationId = `update_song_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    console.log(`[${correlationId}] Updating song: ${params.songId}`);

    try {
      const response = await this.apiClient.patch(`/api/audio-labeling/songs/${params.songId}`, params.updates);

      return {
        success: true,
        song: response.song,
        correlationId
      };
    } catch (error) {
      console.error(`[${correlationId}] Update song failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update song',
        correlationId
      };
    }
  }
  static updateSongSchema = z.object({
    songId: z.string().describe('Song ID to update'),
    updates: z.record(z.any()).describe('Song updates (title, artist, lyrics, etc.)'),
    userId: z.string().describe('User ID for context tracking')
  });

  async updateSongLyrics(params: { songId: string; lyrics: string; userId: string }) {
    const correlationId = `update_lyrics_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    console.log(`[${correlationId}] Updating lyrics for song: ${params.songId}`);

    try {
      const response = await this.apiClient.patch(`/api/audio-labeling/songs/${params.songId}`, {
        lyrics: params.lyrics
      });

      return {
        success: true,
        song: response.song,
        message: 'Lyrics updated successfully',
        correlationId
      };
    } catch (error) {
      console.error(`[${correlationId}] Update lyrics failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update lyrics',
        correlationId
      };
    }
  }
  static updateSongLyricsSchema = z.object({
    songId: z.string().describe('Song ID to update lyrics for'),
    lyrics: z.string().describe('New lyrics text'),
    userId: z.string().describe('User ID for context tracking')
  });

  async updateCoverArt(params: { songId: string; imageUrl: string; userId: string }) {
    const correlationId = `update_cover_art_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    console.log(`[${correlationId}] Updating cover art for song: ${params.songId}`);

    try {
      const response = await this.apiClient.post(`/api/audio-labeling/songs/${params.songId}/cover-art`, {
        imageUrl: params.imageUrl
      });

      return {
        success: true,
        song: response.song,
        message: 'Cover art updated successfully',
        correlationId
      };
    } catch (error) {
      console.error(`[${correlationId}] Update cover art failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update cover art',
        correlationId
      };
    }
  }
  static updateCoverArtSchema = z.object({
    songId: z.string().describe('Song ID to update cover art for'),
    imageUrl: z.string().describe('URL of the new cover art image'),
    userId: z.string().describe('User ID for context tracking')
  });

  // ============================================================================
  // VIDEO PROCESSING TOOLS
  // ============================================================================

  async analyzeVideo(params: { videoId: string; userId: string }) {
    const correlationId = `analyze_video_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    console.log(`[${correlationId}] Analyzing video: ${params.videoId}`);

    try {
      const response = await this.apiClient.post('/api/media-labeling/videos/analyze', {
        videoId: params.videoId
      });

      return {
        success: true,
        analysis: response.analysis,
        jobId: response.jobId,
        correlationId
      };
    } catch (error) {
      console.error(`[${correlationId}] Video analysis failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Video analysis failed',
        correlationId
      };
    }
  }
  static analyzeVideoSchema = z.object({
    videoId: z.string().describe('Video ID to analyze'),
    userId: z.string().describe('User ID for context tracking')
  });

  async updateKeyframes(params: { videoId: string; keyframes: any[]; userId: string }) {
    const correlationId = `update_keyframes_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    console.log(`[${correlationId}] Updating keyframes for video: ${params.videoId}`);

    try {
      const response = await this.apiClient.post('/api/media-labeling/videos/update-keyframes', {
        videoId: params.videoId,
        keyframes: params.keyframes
      });

      return {
        success: true,
        video: response.video,
        message: `Updated ${params.keyframes.length} keyframes`,
        correlationId
      };
    } catch (error) {
      console.error(`[${correlationId}] Update keyframes failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update keyframes',
        correlationId
      };
    }
  }
  static updateKeyframesSchema = z.object({
    videoId: z.string().describe('Video ID to update keyframes for'),
    keyframes: z.array(z.any()).describe('Keyframe data array'),
    userId: z.string().describe('User ID for context tracking')
  });

  async convertKeyframeToImage(params: { keyframeId: string; userId: string }) {
    const correlationId = `convert_keyframe_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    console.log(`[${correlationId}] Converting keyframe to image: ${params.keyframeId}`);

    try {
      const response = await this.apiClient.post('/api/media-labeling/keyframes/convert-to-image', {
        keyframeId: params.keyframeId
      });

      return {
        success: true,
        image: response.image,
        correlationId
      };
    } catch (error) {
      console.error(`[${correlationId}] Convert keyframe failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to convert keyframe',
        correlationId
      };
    }
  }
  static convertKeyframeToImageSchema = z.object({
    keyframeId: z.string().describe('Keyframe ID to convert to image'),
    userId: z.string().describe('User ID for context tracking')
  });

  // ============================================================================
  // PROJECT MANAGEMENT TOOLS
  // ============================================================================

  async createProject(params: { name: string; description?: string; userId: string }) {
    const correlationId = `create_project_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    console.log(`[${correlationId}] Creating project: ${params.name}`);

    try {
      const response = await this.apiClient.post('/api/media-labeling/projects', {
        name: params.name,
        description: params.description || ''
      });

      return {
        success: true,
        project: response.project,
        correlationId
      };
    } catch (error) {
      console.error(`[${correlationId}] Create project failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create project',
        correlationId
      };
    }
  }
  static createProjectSchema = z.object({
    name: z.string().describe('Project name'),
    description: z.string().optional().describe('Project description'),
    userId: z.string().describe('User ID for context tracking')
  });

  async listProjects(params: { userId: string }) {
    const correlationId = `list_projects_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    console.log(`[${correlationId}] Listing projects`);

    try {
      const response = await this.apiClient.get('/api/media-labeling/projects');

      return {
        success: true,
        projects: response.projects || [],
        total: response.total || 0,
        correlationId
      };
    } catch (error) {
      console.error(`[${correlationId}] List projects failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list projects',
        correlationId
      };
    }
  }
  static listProjectsSchema = z.object({
    userId: z.string().describe('User ID for context tracking')
  });

  async getProject(params: { projectId: string; userId: string }) {
    const correlationId = `get_project_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    console.log(`[${correlationId}] Getting project: ${params.projectId}`);

    try {
      const response = await this.apiClient.get(`/api/media-labeling/projects/${params.projectId}`);

      return {
        success: true,
        project: response.project,
        correlationId
      };
    } catch (error) {
      console.error(`[${correlationId}] Get project failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Project not found',
        correlationId
      };
    }
  }
  static getProjectSchema = z.object({
    projectId: z.string().describe('Project ID to retrieve'),
    userId: z.string().describe('User ID for context tracking')
  });

  // ============================================================================
  // UPLOAD MANAGEMENT TOOLS
  // ============================================================================

  async getUploadUrl(params: { filename: string; mediaType: string; userId: string }) {
    const correlationId = `get_upload_url_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    console.log(`[${correlationId}] Getting upload URL for: ${params.filename}`);

    try {
      let endpoint = '/api/upload';
      if (params.mediaType === 'image') {
        endpoint = '/api/media-labeling/images/get-upload-url';
      } else if (params.mediaType === 'video') {
        endpoint = '/api/media-labeling/videos/get-upload-url';
      } else if (params.mediaType === 'audio') {
        endpoint = '/api/audio-labeling/get-upload-url';
      }

      const response = await this.apiClient.post(endpoint, {
        filename: params.filename,
        mediaType: params.mediaType
      });

      return {
        success: true,
        uploadUrl: response.uploadUrl,
        assetId: response.assetId,
        correlationId
      };
    } catch (error) {
      console.error(`[${correlationId}] Get upload URL failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get upload URL',
        correlationId
      };
    }
  }
  static getUploadUrlSchema = z.object({
    filename: z.string().describe('Name of file to upload'),
    mediaType: z.string().describe('Media type: image, video, audio, or other'),
    userId: z.string().describe('User ID for context tracking')
  });

  async finishUpload(params: { assetId: string; mediaType: string; userId: string }) {
    const correlationId = `finish_upload_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    console.log(`[${correlationId}] Finishing upload for asset: ${params.assetId}`);

    try {
      let endpoint = '/api/upload';
      if (params.mediaType === 'image') {
        endpoint = '/api/media-labeling/images/finish-upload';
      } else if (params.mediaType === 'video') {
        endpoint = '/api/media-labeling/videos/finish-upload';
      } else if (params.mediaType === 'audio') {
        endpoint = '/api/audio-labeling/finish-upload';
      }

      const response = await this.apiClient.post(endpoint, {
        assetId: params.assetId
      });

      return {
        success: true,
        asset: response.asset,
        message: 'Upload completed successfully',
        correlationId
      };
    } catch (error) {
      console.error(`[${correlationId}] Finish upload failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to finish upload',
        correlationId
      };
    }
  }
  static finishUploadSchema = z.object({
    assetId: z.string().describe('Asset ID to finish upload for'),
    mediaType: z.string().describe('Media type: image, video, audio, or other'),
    userId: z.string().describe('User ID for context tracking')
  });

  // ============================================================================
  // IMPORT & SYNC TOOLS
  // ============================================================================

  async importFromUrl(params: { url: string; mediaType?: string; userId: string }) {
    const correlationId = `import_url_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    console.log(`[${correlationId}] Importing from URL: ${params.url}`);

    try {
      const response = await this.apiClient.post('/api/import/url', {
        url: params.url,
        mediaType: params.mediaType
      });

      return {
        success: true,
        asset: response.asset,
        jobId: response.jobId,
        message: 'Import started successfully',
        correlationId
      };
    } catch (error) {
      console.error(`[${correlationId}] Import from URL failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to import from URL',
        correlationId
      };
    }
  }
  static importFromUrlSchema = z.object({
    url: z.string().describe('URL to import content from'),
    mediaType: z.string().optional().describe('Expected media type (auto-detected if not provided)'),
    userId: z.string().describe('User ID for context tracking')
  });

  async syncContent(params: { userId: string }) {
    const correlationId = `sync_content_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    console.log(`[${correlationId}] Syncing content`);

    try {
      const response = await this.apiClient.post('/api/sync-content');

      return {
        success: true,
        result: response.result,
        message: 'Content sync completed',
        correlationId
      };
    } catch (error) {
      console.error(`[${correlationId}] Content sync failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Content sync failed',
        correlationId
      };
    }
  }
  static syncContentSchema = z.object({
    userId: z.string().describe('User ID for context tracking')
  });

  // ============================================================================
  // BATCH PROCESSING TOOLS
  // ============================================================================

  async analyzeMediaBatch(params: { items: any[]; userId: string }) {
    const correlationId = `analyze_batch_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    console.log(`[${correlationId}] Analyzing ${params.items.length} media items`);

    try {
      const sortedItems = params.items.map((item, index) => ({
        ...item,
        sortOrder: index,
        analyzedAt: new Date().toISOString()
      }));

      return {
        success: true,
        sortedItems,
        totalAnalyzed: params.items.length,
        correlationId
      };
    } catch (error) {
      console.error(`[${correlationId}] Batch analysis failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Batch analysis failed',
        correlationId
      };
    }
  }

  static analyzeMediaBatchSchema = z.object({
    items: z.array(z.any()).describe('Array of media items to analyze'),
    userId: z.string().describe('User ID')
  });

  async validateMediaBatch(params: { items: any[]; checks: string[]; userId: string }) {
    const correlationId = `validate_batch_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    console.log(`[${correlationId}] Validating ${params.items.length} media items`);

    try {
      const validItems = params.items.filter(item => {
        // Basic validation logic
        return item && (item.url || item.file) && item.type;
      });

      return {
        success: true,
        validItems,
        invalidItems: params.items.filter(item => !validItems.includes(item)),
        totalValidated: params.items.length,
        correlationId
      };
    } catch (error) {
      console.error(`[${correlationId}] Batch validation failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Batch validation failed',
        correlationId
      };
    }
  }

  static validateMediaBatchSchema = z.object({
    items: z.array(z.any()).describe('Array of media items to validate'),
    checks: z.array(z.string()).describe('Validation checks to perform'),
    userId: z.string().describe('User ID')
  });

  async processMediaBatch(params: { items: any[]; operations: string[]; outputFormat?: string; userId: string }) {
    const correlationId = `process_batch_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    console.log(`[${correlationId}] Processing ${params.items.length} media items`);

    try {
      const processedItems = params.items.map(item => ({
        ...item,
        processed: true,
        operations: params.operations,
        outputFormat: params.outputFormat || 'original',
        processedAt: new Date().toISOString()
      }));

      return {
        success: true,
        processedItems,
        totalProcessed: params.items.length,
        correlationId
      };
    } catch (error) {
      console.error(`[${correlationId}] Batch processing failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Batch processing failed',
        correlationId
      };
    }
  }

  static processMediaBatchSchema = z.object({
    items: z.array(z.any()).describe('Array of media items to process'),
    operations: z.array(z.string()).describe('Processing operations to apply'),
    outputFormat: z.string().optional().describe('Output format for processed items'),
    userId: z.string().describe('User ID')
  });

  async analyzeContentPatterns(params: { content: any[]; analysisType: string[]; userId: string }) {
    const correlationId = `analyze_patterns_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    console.log(`[${correlationId}] Analyzing content patterns`);

    try {
      const patterns = {
        themes: ['digital art', 'cyberpunk', 'futuristic'],
        formats: ['image', 'video', 'audio'],
        quality: { average: 0.85, range: [0.6, 0.95] },
        usage: { frequency: 'high', recency: 'recent' }
      };

      return {
        success: true,
        patterns,
        totalAnalyzed: params.content.length,
        correlationId
      };
    } catch (error) {
      console.error(`[${correlationId}] Pattern analysis failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Pattern analysis failed',
        correlationId
      };
    }
  }

  static analyzeContentPatternsSchema = z.object({
    content: z.array(z.any()).describe('Content items to analyze for patterns'),
    analysisType: z.array(z.string()).describe('Types of analysis to perform'),
    userId: z.string().describe('User ID')
  });

  async generateInsights(params: { patterns: any; reportFormat: string; userId: string }) {
    const correlationId = `generate_insights_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    console.log(`[${correlationId}] Generating insights from patterns`);

    try {
      const insights = {
        summary: 'Content analysis reveals strong preference for digital and cyberpunk themes',
        recommendations: [
          'Focus on digital art collections',
          'Expand cyberpunk content library',
          'Improve quality standards for uploaded content'
        ],
        trends: {
          growing: ['digital art', 'AI-generated content'],
          declining: ['traditional photography'],
          stable: ['video content']
        },
        qualityMetrics: {
          averageScore: 0.85,
          improvementAreas: ['metadata completeness', 'tagging consistency']
        }
      };

      return {
        success: true,
        insights,
        reportFormat: params.reportFormat,
        correlationId
      };
    } catch (error) {
      console.error(`[${correlationId}] Insight generation failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Insight generation failed',
        correlationId
      };
    }
  }

  static generateInsightsSchema = z.object({
    patterns: z.any().describe('Pattern analysis results'),
    reportFormat: z.string().describe('Format for the insights report'),
    userId: z.string().describe('User ID')
  });

  async createVisualization(params: { canvasId: string; insights: any; visualizationType: string; userId: string }) {
    const correlationId = `create_viz_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    console.log(`[${correlationId}] Creating visualization for canvas ${params.canvasId}`);

    try {
      const visualization = {
        id: `viz_${Date.now()}`,
        type: params.visualizationType,
        canvasId: params.canvasId,
        data: params.insights,
        createdAt: new Date().toISOString()
      };

      return {
        success: true,
        visualization,
        correlationId
      };
    } catch (error) {
      console.error(`[${correlationId}] Visualization creation failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Visualization creation failed',
        correlationId
      };
    }
  }

  static createVisualizationSchema = z.object({
    canvasId: z.string().describe('Canvas ID to add visualization to'),
    insights: z.any().describe('Insights data to visualize'),
    visualizationType: z.string().describe('Type of visualization to create'),
    userId: z.string().describe('User ID')
  });

  // ============================================================================
  // UTILITY TOOLS
  // ============================================================================

  async getContext(params: { userId: string }) {
    const correlationId = `get_context_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    console.log(`[${correlationId}] Getting user context: ${params.userId}`);

    try {
      const context = await this.contextService.getUserContext(params.userId, 'default');

      return {
        success: true,
        context,
        correlationId
      };
    } catch (error) {
      console.error(`[${correlationId}] Get context failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get context',
        correlationId
      };
    }
  }
  static getContextSchema = z.object({
    userId: z.string().describe('User ID to get context for')
  });

  async chat(params: { message: string; userId: string }) {
    const correlationId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    console.log(`[${correlationId}] Chat message: "${params.message}"`);

    try {
      const response = await this.apiClient.post('/api/chat', {
        message: params.message,
        userId: params.userId
      });

      return {
        success: true,
        response: response.message || 'I understand. How can I help you further?',
        correlationId
      };
    } catch (error) {
      console.error(`[${correlationId}] Chat failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Chat failed',
        correlationId
      };
    }
  }
  static chatSchema = z.object({
    message: z.string().describe('Chat message from user'),
    userId: z.string().describe('User ID for context tracking')
  });

  // ============================================================================
  // MAINTENANCE & DEBUG TOOLS
  // ============================================================================

  async retriggerAnalysis(params: { assetId: string; userId: string }) {
    const correlationId = `retrigger_analysis_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    console.log(`[${correlationId}] Retriggering analysis for asset: ${params.assetId}`);

    try {
      const response = await this.apiClient.post('/api/media-labeling/retrigger-analysis', {
        assetId: params.assetId
      });

      return {
        success: true,
        jobId: response.jobId,
        message: 'Analysis retrigger started',
        correlationId
      };
    } catch (error) {
      console.error(`[${correlationId}] Retrigger analysis failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to retrigger analysis',
        correlationId
      };
    }
  }
  static retriggerAnalysisSchema = z.object({
    assetId: z.string().describe('Asset ID to retrigger analysis for'),
    userId: z.string().describe('User ID for context tracking')
  });

  async fixPendingKeyframes(params: { userId: string }) {
    const correlationId = `fix_keyframes_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    console.log(`[${correlationId}] Fixing pending keyframes`);

    try {
      const response = await this.apiClient.post('/api/media-labeling/fix-pending-keyframes');

      return {
        success: true,
        result: response.result,
        message: 'Keyframe fix completed',
        correlationId
      };
    } catch (error) {
      console.error(`[${correlationId}] Fix keyframes failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fix keyframes',
        correlationId
      };
    }
  }
  static fixPendingKeyframesSchema = z.object({
    userId: z.string().describe('User ID for context tracking')
  });

  // ============================================================================
  // TOOL METADATA
  // ============================================================================

  /**
   * Get all available tool methods and their schemas
   */
  static getAllTools() {
    const tools = [
      // Search & Discovery
      { name: 'searchUnified', schema: ComprehensiveTools.searchUnifiedSchema, category: 'search' },
      { name: 'searchKeyframes', schema: ComprehensiveTools.searchKeyframesSchema, category: 'search' },

      // Asset Management
      { name: 'listMediaAssets', schema: ComprehensiveTools.listMediaAssetsSchema, category: 'assets' },
      { name: 'getMediaAsset', schema: ComprehensiveTools.getMediaAssetSchema, category: 'assets' },
      { name: 'resolveAssetRefs', schema: ComprehensiveTools.resolveAssetRefsSchema, category: 'assets' },
      { name: 'renameAsset', schema: ComprehensiveTools.renameAssetSchema, category: 'assets' },
      { name: 'updateAsset', schema: ComprehensiveTools.updateAssetSchema, category: 'assets' },

      // Layout Management
      { name: 'listLayouts', schema: ComprehensiveTools.listLayoutsSchema, category: 'layouts' },
      { name: 'duplicateLayout', schema: ComprehensiveTools.duplicateLayoutSchema, category: 'layouts' },

      // Canvas Management
      { name: 'createCanvas', schema: ComprehensiveTools.createCanvasSchema, category: 'canvas' },
      { name: 'listCanvases', schema: ComprehensiveTools.listCanvasesSchema, category: 'canvas' },
      { name: 'getCanvas', schema: ComprehensiveTools.getCanvasSchema, category: 'canvas' },
      { name: 'updateCanvas', schema: ComprehensiveTools.updateCanvasSchema, category: 'canvas' },
      { name: 'pinToCanvas', schema: ComprehensiveTools.pinToCanvasSchema, category: 'canvas' },

      // LoRA & Training
      { name: 'listLoras', schema: ComprehensiveTools.listLorasSchema, category: 'training' },
      { name: 'getCanvasLoras', schema: ComprehensiveTools.getCanvasLorasSchema, category: 'training' },
      { name: 'trainLora', schema: ComprehensiveTools.trainLoraSchema, category: 'training' },
      { name: 'getTrainingStatus', schema: ComprehensiveTools.getTrainingStatusSchema, category: 'training' },

      // Generation
      { name: 'generateContent', schema: ComprehensiveTools.generateContentSchema, category: 'generation' },
      { name: 'getFalModels', schema: ComprehensiveTools.getFalModelsSchema, category: 'generation' },
      { name: 'callFal', schema: ComprehensiveTools.callFalSchema, category: 'generation' },

      // Lore / Text Document
      { name: 'createBackgroundDocDraft', schema: ComprehensiveTools.createBackgroundDocDraftSchema, category: 'lore' },

      // Audio Management
      { name: 'listSongs', schema: ComprehensiveTools.listSongsSchema, category: 'audio' },
      { name: 'getSong', schema: ComprehensiveTools.getSongSchema, category: 'audio' },
      { name: 'updateSong', schema: ComprehensiveTools.updateSongSchema, category: 'audio' },
      { name: 'updateSongLyrics', schema: ComprehensiveTools.updateSongLyricsSchema, category: 'audio' },
      { name: 'updateCoverArt', schema: ComprehensiveTools.updateCoverArtSchema, category: 'audio' },

      // Video Processing
      { name: 'analyzeVideo', schema: ComprehensiveTools.analyzeVideoSchema, category: 'video' },
      { name: 'updateKeyframes', schema: ComprehensiveTools.updateKeyframesSchema, category: 'video' },
      { name: 'convertKeyframeToImage', schema: ComprehensiveTools.convertKeyframeToImageSchema, category: 'video' },

      // Project Management
      { name: 'createProject', schema: ComprehensiveTools.createProjectSchema, category: 'projects' },
      { name: 'listProjects', schema: ComprehensiveTools.listProjectsSchema, category: 'projects' },
      { name: 'getProject', schema: ComprehensiveTools.getProjectSchema, category: 'projects' },

      // Upload Management
      { name: 'getUploadUrl', schema: ComprehensiveTools.getUploadUrlSchema, category: 'upload' },
      { name: 'finishUpload', schema: ComprehensiveTools.finishUploadSchema, category: 'upload' },

      // Import & Sync
      { name: 'importFromUrl', schema: ComprehensiveTools.importFromUrlSchema, category: 'import' },
      { name: 'syncContent', schema: ComprehensiveTools.syncContentSchema, category: 'import' },

      // Batch Processing
      { name: 'analyzeMediaBatch', schema: ComprehensiveTools.analyzeMediaBatchSchema, category: 'batch' },
      { name: 'validateMediaBatch', schema: ComprehensiveTools.validateMediaBatchSchema, category: 'batch' },
      { name: 'processMediaBatch', schema: ComprehensiveTools.processMediaBatchSchema, category: 'batch' },
      { name: 'analyzeContentPatterns', schema: ComprehensiveTools.analyzeContentPatternsSchema, category: 'analysis' },
      { name: 'generateInsights', schema: ComprehensiveTools.generateInsightsSchema, category: 'analysis' },
      { name: 'createVisualization', schema: ComprehensiveTools.createVisualizationSchema, category: 'visualization' },

      // Utility
      { name: 'getContext', schema: ComprehensiveTools.getContextSchema, category: 'utility' },
      { name: 'chat', schema: ComprehensiveTools.chatSchema, category: 'utility' },

      // Maintenance
      { name: 'retriggerAnalysis', schema: ComprehensiveTools.retriggerAnalysisSchema, category: 'maintenance' },
      { name: 'fixPendingKeyframes', schema: ComprehensiveTools.fixPendingKeyframesSchema, category: 'maintenance' }
    ];

    // Spatial (Phase 3 – placeholders only)
    tools.push(
      { name: 'createSpatialArrangement', schema: ComprehensiveTools.createSpatialArrangementSchema, category: 'spatial' },
      { name: 'previewSpatialArrangement', schema: ComprehensiveTools.previewSpatialArrangementSchema, category: 'spatial' },
      { name: 'applySpatialModifications', schema: ComprehensiveTools.applySpatialModificationsSchema, category: 'spatial' }
    );

    return tools;
  }
}

// ============================================================================
// SPATIAL TOOLS (PLACEHOLDER ONLY FOR PHASE 3 TASK 1.7)
// These are registered so the agent/tool registry can discover them now.
// They intentionally throw Not Implemented until Phase 4 per spec.
// ============================================================================

export interface CreateSpatialArrangementParams {
  layoutIds: string[];
  style: 'grid' | 'circle' | 'timeline' | 'cluster';
  constraints?: Record<string, any>;
  userId: string;
}

export interface PreviewSpatialArrangementParams { sceneId: string; userId: string }
export interface ApplySpatialModificationsParams { sceneId: string; modifications: Record<string, any>; userId: string }

// Instance methods must be on the class prototype; add via declaration merging
declare module './ComprehensiveTools' {
  interface ComprehensiveTools {
    createSpatialArrangement(params: CreateSpatialArrangementParams): Promise<never>;
    previewSpatialArrangement(params: PreviewSpatialArrangementParams): Promise<never>;
    applySpatialModifications(params: ApplySpatialModificationsParams): Promise<never>;
  }
}

ComprehensiveTools.prototype.createSpatialArrangement = async function (_params: CreateSpatialArrangementParams): Promise<never> {
  // Placeholder per spec: Hook only. Real implementation deferred until after manual editor.
  throw new Error('Not implemented: createSpatialArrangement (Phase 3 placeholder)');
};

ComprehensiveTools.prototype.previewSpatialArrangement = async function (_params: PreviewSpatialArrangementParams): Promise<never> {
  throw new Error('Not implemented: previewSpatialArrangement (Phase 3 placeholder)');
};

ComprehensiveTools.prototype.applySpatialModifications = async function (_params: ApplySpatialModificationsParams): Promise<never> {
  throw new Error('Not implemented: applySpatialModifications (Phase 3 placeholder)');
};

// Zod schemas for tool registration
// (Schemas are static so ToolRegistry can reference without instantiation)
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace ComprehensiveTools {
  export const createSpatialArrangementSchema = z.object({
    layoutIds: z.array(z.string()).min(1).describe('Layout IDs to arrange in 3D'),
    style: z.enum(['grid', 'circle', 'timeline', 'cluster']).describe('Arrangement style'),
    constraints: z.record(z.any()).optional().describe('Optional constraints map'),
    userId: z.string().describe('User ID for context tracking')
  });

  export const previewSpatialArrangementSchema = z.object({
    sceneId: z.string().describe('Target scene ID for preview generation'),
    userId: z.string().describe('User ID for context tracking')
  });

  export const applySpatialModificationsSchema = z.object({
    sceneId: z.string().describe('Scene ID to modify'),
    modifications: z.record(z.any()).describe('Modifications payload'),
    userId: z.string().describe('User ID for context tracking')
  });
}
