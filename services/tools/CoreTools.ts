// services/tools/CoreTools.ts
import { tool } from 'ai';
import { z } from 'zod';
import { RedisContextService } from '../context/RedisContextService';

interface ApiClient {
  get(url: string, config?: any): Promise<any>;
  post(url: string, data?: any, config?: any): Promise<any>;
  put(url: string, data?: any, config?: any): Promise<any>;
  delete(url: string, config?: any): Promise<any>;
}

// Simple API client implementation
class SimpleApiClient implements ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = process.env.PUBLIC_API_BASE_URL || 'http://localhost:3000') {
    this.baseUrl = baseUrl;
  }

  async get(url: string, config?: any): Promise<any> {
    const response = await fetch(`${this.baseUrl}${url}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...config?.headers
      }
    });
    return { data: await response.json(), status: response.status };
  }

  async post(url: string, data?: any, config?: any): Promise<any> {
    const response = await fetch(`${this.baseUrl}${url}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...config?.headers
      },
      body: JSON.stringify(data)
    });
    return { data: await response.json(), status: response.status };
  }

  async put(url: string, data?: any, config?: any): Promise<any> {
    const response = await fetch(`${this.baseUrl}${url}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...config?.headers
      },
      body: JSON.stringify(data)
    });
    return { data: await response.json(), status: response.status };
  }

  async delete(url: string, config?: any): Promise<any> {
    const response = await fetch(`${this.baseUrl}${url}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...config?.headers
      }
    });
    return { data: await response.json(), status: response.status };
  }
}

export class CoreTools {
  private apiClient: ApiClient;

  constructor(
    private contextService: RedisContextService,
    apiClient?: ApiClient
  ) {
    this.apiClient = apiClient || new SimpleApiClient();
  }

  // ===== SEARCH TOOLS =====
  searchUnifiedTool = tool({
    description: 'Search for multimedia content across the platform',
    parameters: z.object({
      query: z.string().describe('Search query'),
      mediaType: z.enum(['image', 'video', 'audio', 'text', 'all']).optional(),
      limit: z.number().min(1).max(100).default(20)
    }),
    execute: async (params: any, context: any) => {
      const correlationId = this.contextService.generateCorrelationId();

      try {
        console.log(`[${correlationId}] Executing unified search:`, params);

        let url = `/api/unified-search?q=${encodeURIComponent(params.query)}&limit=${params.limit}`;
        if (params.mediaType && params.mediaType !== 'all') {
          url += `&type=${params.mediaType}`;
        }

        const results = await this.apiClient.get(url, {
          headers: {
            'X-Correlation-ID': correlationId,
            'X-Tenant-ID': context?.tenantId || 'default',
            'X-User-ID': context?.userId || 'default'
          }
        });

        // Update user context with search
        if (context?.userId && context?.tenantId) {
          await this.contextService.addRecentSearch(context.userId, context.tenantId, params.query);
        }

        console.log(`[${correlationId}] Search completed:`, results.data.results?.length || 0, 'results');
        return { action: 'showResults', payload: results.data };
      } catch (error) {
        console.error(`[${correlationId}] Search failed:`, error);
        throw new Error(`Search failed: ${error instanceof Error ? error instanceof Error ? error.message : 'Unknown error' : 'Unknown error'}`);
      }
    }
  });

  // ===== CANVAS TOOLS =====
  createCanvasTool = tool({
    description: 'Create a new canvas collection for organizing content',
    parameters: z.object({
      name: z.string().describe('Name for the canvas'),
      note: z.string().optional().describe('Description of the canvas purpose'),
      projectId: z.string().optional().describe('Project ID to associate with')
    }),
    execute: async (params: any, context: any) => {
      const correlationId = this.contextService.generateCorrelationId();

      try {
        console.log(`[${correlationId}] Creating canvas:`, params);

        const canvas = await this.apiClient.post('/api/canvas', {
          ...params,
          items: []
        }, {
          headers: {
            'X-Correlation-ID': correlationId,
            'X-Tenant-ID': context?.tenantId || 'default',
            'X-User-ID': context?.userId || 'default'
          }
        });

        if (context?.userId && context?.tenantId) {
          await this.contextService.recordSessionEvent(
            context.userId,
            context.tenantId,
            'canvas_created',
            { canvasId: canvas.data.canvas?.id, name: params.name, correlationId }
          );
        }

        console.log(`[${correlationId}] Canvas created:`, canvas.data.canvas?.id);
        return { action: 'canvasCreated', payload: canvas.data };
      } catch (error) {
        console.error(`[${correlationId}] Canvas creation failed:`, error);
        throw new Error(`Canvas creation failed: ${error instanceof Error ? error instanceof Error ? error.message : 'Unknown error' : 'Unknown error'}`);
      }
    }
  });

  listCanvasesTool = tool({
    description: 'List all available canvases',
    parameters: z.object({
      projectId: z.string().optional().describe('Filter by project ID')
    }),
    execute: async (params: any, context: any) => {
      const correlationId = this.contextService.generateCorrelationId();

      try {
        console.log(`[${correlationId}] Listing canvases`);

        let url = '/api/canvas';
        if (params.projectId) {
          url += `?projectId=${params.projectId}`;
        }

        const result = await this.apiClient.get(url, {
          headers: {
            'X-Correlation-ID': correlationId,
            'X-Tenant-ID': context?.tenantId || 'default',
            'X-User-ID': context?.userId || 'default'
          }
        });

        console.log(`[${correlationId}] Canvases listed:`, result.data.items?.length || 0);
        return { action: 'canvasesListed', payload: result.data };
      } catch (error) {
        console.error(`[${correlationId}] Canvas listing failed:`, error);
        throw new Error(`Canvas listing failed: ${error instanceof Error ? error instanceof Error ? error.message : 'Unknown error' : 'Unknown error'}`);
      }
    }
  });

  getCanvasTool = tool({
    description: 'Get a specific canvas by ID',
    parameters: z.object({
      canvasId: z.string().describe('Canvas ID to retrieve')
    }),
    execute: async (params: any, context: any) => {
      const correlationId = this.contextService.generateCorrelationId();

      try {
        console.log(`[${correlationId}] Getting canvas:`, params.canvasId);

        const result = await this.apiClient.get(`/api/canvas?id=${params.canvasId}`, {
          headers: {
            'X-Correlation-ID': correlationId,
            'X-Tenant-ID': context?.tenantId || 'default',
            'X-User-ID': context?.userId || 'default'
          }
        });

        console.log(`[${correlationId}] Canvas retrieved:`, params.canvasId);
        return { action: 'canvasRetrieved', payload: result.data };
      } catch (error) {
        console.error(`[${correlationId}] Canvas retrieval failed:`, error);
        throw new Error(`Canvas retrieval failed: ${error instanceof Error ? error instanceof Error ? error.message : 'Unknown error' : 'Unknown error'}`);
      }
    }
  });

  updateCanvasTool = tool({
    description: 'Update canvas content and metadata',
    parameters: z.object({
      canvasId: z.string().describe('Canvas ID to update'),
      name: z.string().optional().describe('New canvas name'),
      note: z.string().optional().describe('New canvas description'),
      items: z.array(z.any()).optional().describe('Canvas items array')
    }),
    execute: async (params: any, context: any) => {
      const correlationId = this.contextService.generateCorrelationId();

      try {
        console.log(`[${correlationId}] Updating canvas:`, params.canvasId);

        const result = await this.apiClient.put('/api/canvas', {
          id: params.canvasId,
          ...params
        }, {
          headers: {
            'X-Correlation-ID': correlationId,
            'X-Tenant-ID': context?.tenantId || 'default',
            'X-User-ID': context?.userId || 'default'
          }
        });

        console.log(`[${correlationId}] Canvas updated:`, params.canvasId);
        return { action: 'canvasUpdated', payload: result.data };
      } catch (error) {
        console.error(`[${correlationId}] Canvas update failed:`, error);
        throw new Error(`Canvas update failed: ${error instanceof Error ? error instanceof Error ? error.message : 'Unknown error' : 'Unknown error'}`);
      }
    }
  });

  pinToCanvasTool = tool({
    description: 'Pin content items to a canvas',
    parameters: z.object({
      canvasId: z.string().describe('ID of the target canvas'),
      contentId: z.string().describe('Content ID to pin'),
      type: z.enum(['image', 'video', 'audio', 'text']).describe('Content type'),
      position: z.object({
        x: z.number(),
        y: z.number(),
        w: z.number().optional(),
        h: z.number().optional()
      }).optional().describe('Position on canvas')
    }),
    execute: async (params: any, context: any) => {
      const correlationId = this.contextService.generateCorrelationId();

      try {
        console.log(`[${correlationId}] Pinning to canvas:`, params);

        // First get the canvas
        const canvas = await this.apiClient.get(`/api/canvas?id=${params.canvasId}`);
        const canvasData = canvas.data.canvas;

        // Add the new item
        const newItem = {
          id: params.contentId,
          type: params.type,
          position: params.position || { x: 0, y: 0, w: 2, h: 2 },
          order: (canvasData.items || []).length
        };

        canvasData.items = [...(canvasData.items || []), newItem];

        // Update the canvas
        const result = await this.apiClient.put('/api/canvas', canvasData, {
          headers: {
            'X-Correlation-ID': correlationId,
            'X-Tenant-ID': context?.tenantId || 'default',
            'X-User-ID': context?.userId || 'default'
          }
        });

        console.log(`[${correlationId}] Content pinned to canvas:`, params.canvasId);
        return { action: 'pinnedToCanvas', payload: result.data };
      } catch (error) {
        console.error(`[${correlationId}] Pin to canvas failed:`, error);
        throw new Error(`Pin to canvas failed: ${error instanceof Error ? error instanceof Error ? error.message : 'Unknown error' : 'Unknown error'}`);
      }
    }
  });

  // ===== PROJECT TOOLS =====
  createProjectTool = tool({
    description: 'Create a new project for organizing canvases and content',
    parameters: z.object({
      name: z.string().describe('Project name'),
      description: z.string().optional().describe('Project description')
    }),
    execute: async (params: any, context: any) => {
      const correlationId = this.contextService.generateCorrelationId();

      try {
        console.log(`[${correlationId}] Creating project:`, params);

        const result = await this.apiClient.post('/api/media-labeling/projects', params, {
          headers: {
            'X-Correlation-ID': correlationId,
            'X-Tenant-ID': context?.tenantId || 'default',
            'X-User-ID': context?.userId || 'default'
          }
        });

        if (context?.userId && context?.tenantId) {
          await this.contextService.recordSessionEvent(
            context.userId,
            context.tenantId,
            'project_created',
            { projectId: result.data.id, name: params.name, correlationId }
          );
        }

        console.log(`[${correlationId}] Project created:`, result.data.id);
        return { action: 'projectCreated', payload: result.data };
      } catch (error) {
        console.error(`[${correlationId}] Project creation failed:`, error);
        throw new Error(`Project creation failed: ${error instanceof Error ? error instanceof Error ? error.message : 'Unknown error' : 'Unknown error'}`);
      }
    }
  });

  listProjectsTool = tool({
    description: 'List all available projects',
    parameters: z.object({
      search: z.string().optional().describe('Search term to filter projects')
    }),
    execute: async (params: any, context: any) => {
      const correlationId = this.contextService.generateCorrelationId();

      try {
        console.log(`[${correlationId}] Listing projects`);

        let url = '/api/media-labeling/projects';
        if (params.search) {
          url += `?search=${encodeURIComponent(params.search)}`;
        }

        const result = await this.apiClient.get(url, {
          headers: {
            'X-Correlation-ID': correlationId,
            'X-Tenant-ID': context?.tenantId || 'default',
            'X-User-ID': context?.userId || 'default'
          }
        });

        console.log(`[${correlationId}] Projects listed:`, Array.isArray(result.data) ? result.data.length : 0);
        return { action: 'projectsListed', payload: { projects: result.data } };
      } catch (error) {
        console.error(`[${correlationId}] Project listing failed:`, error);
        throw new Error(`Project listing failed: ${error instanceof Error ? error instanceof Error ? error.message : 'Unknown error' : 'Unknown error'}`);
      }
    }
  });

  // ===== MEDIA ASSET TOOLS =====
  listMediaAssetsTool = tool({
    description: 'List media assets with filtering options',
    parameters: z.object({
      type: z.enum(['image', 'video', 'audio', 'all']).optional().describe('Media type filter'),
      search: z.string().optional().describe('Search query'),
      project: z.string().optional().describe('Project ID filter'),
      page: z.number().min(1).default(1).describe('Page number'),
      limit: z.number().min(1).max(100).default(20).describe('Items per page')
    }),
    execute: async (params: any, context: any) => {
      const correlationId = this.contextService.generateCorrelationId();

      try {
        console.log(`[${correlationId}] Listing media assets:`, params);

        const searchParams = new URLSearchParams();
        if (params.type && params.type !== 'all') searchParams.set('type', params.type);
        if (params.search) searchParams.set('search', params.search);
        if (params.project) searchParams.set('project', params.project);
        searchParams.set('page', params.page.toString());
        searchParams.set('limit', params.limit.toString());

        const result = await this.apiClient.get(`/api/media-labeling/assets?${searchParams}`, {
          headers: {
            'X-Correlation-ID': correlationId,
            'X-Tenant-ID': context?.tenantId || 'default',
            'X-User-ID': context?.userId || 'default'
          }
        });

        console.log(`[${correlationId}] Media assets listed:`, result.data.length || 0);
        return { action: 'mediaAssetsListed', payload: result.data };
      } catch (error) {
        console.error(`[${correlationId}] Media assets listing failed:`, error);
        throw new Error(`Media assets listing failed: ${error instanceof Error ? error instanceof Error ? error.message : 'Unknown error' : 'Unknown error'}`);
      }
    }
  });

  // ===== LORA TOOLS =====
  listLorasTool = tool({
    description: 'List all available LoRA models for generation',
    parameters: z.object({}),
    execute: async (params: any, context: any) => {
      const correlationId = this.contextService.generateCorrelationId();

      try {
        console.log(`[${correlationId}] Listing LoRA models`);

        const result = await this.apiClient.get('/api/loras', {
          headers: {
            'X-Correlation-ID': correlationId,
            'X-Tenant-ID': context?.tenantId || 'default',
            'X-User-ID': context?.userId || 'default'
          }
        });

        console.log(`[${correlationId}] LoRA models listed:`, Array.isArray(result.data) ? result.data.length : 0);
        return { action: 'lorasListed', payload: result.data };
      } catch (error) {
        console.error(`[${correlationId}] LoRA listing failed:`, error);
        throw new Error(`LoRA listing failed: ${error instanceof Error ? error instanceof Error ? error.message : 'Unknown error' : 'Unknown error'}`);
      }
    }
  });

  getCanvasLorasTool = tool({
    description: 'Get LoRA models associated with a specific canvas',
    parameters: z.object({
      canvasId: z.string().optional().describe('Canvas ID'),
      canvasName: z.string().optional().describe('Canvas name'),
      all: z.boolean().default(false).describe('Get all canvas LoRAs')
    }),
    execute: async (params: any, context: any) => {
      const correlationId = this.contextService.generateCorrelationId();

      try {
        console.log(`[${correlationId}] Getting canvas LoRAs:`, params);

        const searchParams = new URLSearchParams();
        if (params.canvasId) searchParams.set('id', params.canvasId);
        if (params.canvasName) searchParams.set('name', params.canvasName);
        if (params.all) searchParams.set('all', '1');

        const result = await this.apiClient.get(`/api/canvas/loras?${searchParams}`, {
          headers: {
            'X-Correlation-ID': correlationId,
            'X-Tenant-ID': context?.tenantId || 'default',
            'X-User-ID': context?.userId || 'default'
          }
        });

        console.log(`[${correlationId}] Canvas LoRAs retrieved`);
        return { action: 'canvasLorasRetrieved', payload: result.data };
      } catch (error) {
        console.error(`[${correlationId}] Canvas LoRAs retrieval failed:`, error);
        throw new Error(`Canvas LoRAs retrieval failed: ${error instanceof Error ? error instanceof Error ? error.message : 'Unknown error' : 'Unknown error'}`);
      }
    }
  });

  // ===== GENERATION TOOLS =====
  prepareGenerateTool = tool({
    description: 'Set up media generation with parameters',
    parameters: z.object({
      userRequest: z.string().describe('The full user request text to analyze'),
      type: z.enum(['image', 'video', 'audio']).optional().describe('Media type if known'),
      prompt: z.string().optional().describe('Generation prompt if specified'),
      model: z.string().optional().describe('Model to use'),
      loraNames: z.array(z.string()).optional().describe('Names of LoRA models to use')
    }),
    execute: async (params: any, context: any) => {
      const correlationId = this.contextService.generateCorrelationId();

      try {
        console.log(`[${correlationId}] Preparing generation:`, params);

        // Smart extraction from user request (similar to original agent logic)
        const request = params.userRequest.toLowerCase();
        let finalType = params.type;

        if (!finalType) {
          if (/\b(video|movie|clip|animation)\b/i.test(request)) {
            finalType = 'video';
          } else if (/\b(audio|song|track|music|sound)\b/i.test(request)) {
            finalType = 'audio';
          } else {
            finalType = 'image';
          }
        }

        let finalPrompt = params.prompt || 'Creative content';
        let resolvedLoras: any[] = [];

        // Look up LoRA data if names provided
        if (params.loraNames && params.loraNames.length > 0) {
          try {
            const lorasResult = await this.apiClient.get('/api/loras');
            const allLoras = lorasResult.data;

            resolvedLoras = params.loraNames.map((name: string) => {
              const cleanName = name.toLowerCase().trim();
              return allLoras.find((l: any) =>
                (l.canvasName && l.canvasName.toLowerCase().includes(cleanName)) ||
                (l.triggerWord && l.triggerWord.toLowerCase().includes(cleanName)) ||
                (cleanName.includes(l.canvasName?.toLowerCase() || ''))
              );
            }).filter(Boolean).map((l: any) => ({
              path: l.artifactUrl || l.path,
              scale: 1.0,
              triggerWord: l.triggerWord,
              canvasName: l.canvasName
            }));
          } catch (e) {
            console.warn(`[${correlationId}] Failed to resolve LoRA names:`, e);
          }
        }

        const result = {
          type: finalType,
          prompt: finalPrompt,
          model: resolvedLoras.length > 0 ? 'fal-ai/flux-lora' : (params.model || 'default'),
          options: resolvedLoras.length > 0 ? { loras: resolvedLoras } : {},
          originalRequest: params.userRequest,
          extractedLoraNames: params.loraNames || [],
          resolvedLoras: resolvedLoras
        };

        console.log(`[${correlationId}] Generation prepared:`, finalType);
        return { action: 'prepareGenerate', payload: result };
      } catch (error) {
        console.error(`[${correlationId}] Generation preparation failed:`, error);
        throw new Error(`Generation preparation failed: ${error instanceof Error ? error instanceof Error ? error.message : 'Unknown error' : 'Unknown error'}`);
      }
    }
  });

  // ===== UTILITY TOOLS =====
  getContextTool = tool({
    description: 'Get current user context and session information',
    parameters: z.object({}),
    execute: async (params: any, context: any) => {
      const correlationId = this.contextService.generateCorrelationId();

      try {
        console.log(`[${correlationId}] Getting user context`);

        if (!context?.userId || !context?.tenantId) {
          return { action: 'contextRetrieved', payload: { error: 'User context not available' } };
        }

        const userContext = await this.contextService.getUserContext(context.userId, context.tenantId);
        console.log(`[${correlationId}] Context retrieved successfully`);

        return { action: 'contextRetrieved', payload: { context: userContext, correlationId } };
      } catch (error) {
        console.error(`[${correlationId}] Context retrieval failed:`, error);
        throw new Error(`Context retrieval failed: ${error instanceof Error ? error instanceof Error ? error.message : 'Unknown error' : 'Unknown error'}`);
      }
    }
  });

  chatTool = tool({
    description: 'Handle greetings and general conversation',
    parameters: z.object({
      message: z.string().describe('User message to respond to')
    }),
    execute: async (params: any, context: any) => {
      const greetings = [
        "Hey! Ready to help you find content or create something awesome!",
        "Hello! What can I help you discover today?",
        "Hi there! Looking for some media or want to generate something?"
      ];
      const response = greetings[Math.floor(Math.random() * greetings.length)];
      return { action: 'chat', payload: { text: response } };
    }
  });

  // Get all tools as AI SDK compatible format
  getAllTools() {
    return {
      searchUnified: this.searchUnifiedTool,
      createCanvas: this.createCanvasTool,
      listCanvases: this.listCanvasesTool,
      getCanvas: this.getCanvasTool,
      updateCanvas: this.updateCanvasTool,
      pinToCanvas: this.pinToCanvasTool,
      createProject: this.createProjectTool,
      listProjects: this.listProjectsTool,
      listMediaAssets: this.listMediaAssetsTool,
      listLoras: this.listLorasTool,
      getCanvasLoras: this.getCanvasLorasTool,
      prepareGenerate: this.prepareGenerateTool,
      getContext: this.getContextTool,
      chat: this.chatTool
    };
  }

  // Get tool statistics
  getToolStats() {
    const tools = this.getAllTools();
    return {
      totalTools: Object.keys(tools).length,
      categories: {
        search: 1,
        canvas: 5,
        project: 2,
        media: 1,
        lora: 2,
        generation: 1,
        utility: 2
      },
      tools: Object.keys(tools)
    };
  }
}
