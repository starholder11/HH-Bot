// services/tools/ToolRegistry.ts
import { z } from 'zod';
import { tool } from 'ai';
import { RedisContextService } from '../context/RedisContextService';
import { ComprehensiveTools } from './ComprehensiveTools';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: z.ZodSchema;
  execute: (params: any, context?: any) => Promise<any>;
  category: string;
  requiresContext?: boolean;
}

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  private contextService?: RedisContextService;
  private comprehensiveTools: ComprehensiveTools;

  constructor(contextService?: RedisContextService) {
    this.contextService = contextService;
    this.comprehensiveTools = new ComprehensiveTools(contextService!, {
      get: async (url: string) => {
        const response = await fetch(`http://localhost:3000${url}`);
        return response.json();
      },
      post: async (url: string, data?: any) => {
        const response = await fetch(`http://localhost:3000${url}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: data ? JSON.stringify(data) : undefined
        });
        return response.json();
      },
      put: async (url: string, data?: any) => {
        const response = await fetch(`http://localhost:3000${url}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: data ? JSON.stringify(data) : undefined
        });
        return response.json();
      },
      patch: async (url: string, data?: any) => {
        const response = await fetch(`http://localhost:3000${url}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: data ? JSON.stringify(data) : undefined
        });
        return response.json();
      },
      delete: async (url: string) => {
        const response = await fetch(`http://localhost:3000${url}`, {
          method: 'DELETE'
        });
        return response.json();
      }
    });
    this.initializeComprehensiveTools();
  }

  private initializeComprehensiveTools() {
    // Get all tools from ComprehensiveTools and register them
    const allTools = ComprehensiveTools.getAllTools();

    for (const toolDef of allTools) {
      const methodName = toolDef.name;
      const method = (this.comprehensiveTools as any)[methodName];

      if (typeof method === 'function') {
        this.registerTool({
          name: toolDef.name,
          description: this.getToolDescription(toolDef.name, toolDef.category),
          category: toolDef.category,
          parameters: toolDef.schema,
          requiresContext: true,
          execute: method.bind(this.comprehensiveTools)
        });
      }
    }

    console.log(`[ToolRegistry] Registered ${this.tools.size} comprehensive tools`);
  }

  private getToolDescription(name: string, category: string): string {
    const descriptions: Record<string, string> = {
      // Search & Discovery
      'searchUnified': 'Search for multimedia content across the entire platform',
      'searchKeyframes': 'Search for specific video keyframes using natural language',

      // Asset Management
      'listMediaAssets': 'List media assets with filtering and pagination options',
      'getMediaAsset': 'Get detailed information about a specific media asset',
      'renameAsset': 'Rename a media asset file and update its metadata',
      'updateAsset': 'Update asset metadata including title, description, and tags',

      // Layout Management
      'listLayouts': 'List all available layout templates and designs',
      'duplicateLayout': 'Create a copy of an existing layout with optional name change',

      // Canvas Management
      'createCanvas': 'Create a new canvas collection for organizing content',
      'listCanvases': 'List all available canvases with their metadata',
      'getCanvas': 'Get detailed information about a specific canvas',
      'updateCanvas': 'Update canvas properties, items, and metadata',
      'pinToCanvas': 'Pin content items to a canvas with positioning',

      // LoRA & Training
      'listLoras': 'List all available LoRA models for AI generation',
      'getCanvasLoras': 'Get LoRA models associated with a specific canvas',
      'trainLora': 'Start training a new LoRA model from canvas images',
      'getTrainingStatus': 'Check the status of a LoRA training job',

      // Generation
      'generateContent': 'Generate new content using AI models (images, videos, audio)',
      'getFalModels': 'List available FAL AI models for generation',
      'callFal': 'Execute a specific FAL AI model with custom parameters',

      // Audio Management
      'listSongs': 'List all songs in the audio library',
      'getSong': 'Get detailed information about a specific song',
      'updateSong': 'Update song metadata including title, artist, and tags',
      'updateSongLyrics': 'Edit and update song lyrics',
      'updateCoverArt': 'Update the cover art image for a song',

      // Video Processing
      'analyzeVideo': 'Analyze video content and extract keyframes and metadata',
      'updateKeyframes': 'Update keyframe data for a video',
      'convertKeyframeToImage': 'Convert a video keyframe to a standalone image',

      // Project Management
      'createProject': 'Create a new project for organizing content and workflows',
      'listProjects': 'List all available projects with their status',
      'getProject': 'Get detailed information about a specific project',

      // Upload Management
      'getUploadUrl': 'Get a secure upload URL for media files',
      'finishUpload': 'Complete the upload process and finalize asset creation',

      // Import & Sync
      'importFromUrl': 'Import content from external URLs',
      'syncContent': 'Synchronize content across different systems',

      // Utility
      'getContext': 'Get current user context and session information',
      'chat': 'Handle conversational interactions and general queries',

      // Maintenance
      'retriggerAnalysis': 'Restart analysis processing for a media asset',
      'fixPendingKeyframes': 'Fix and process any pending keyframe extractions'
    };

    return descriptions[name] || `${category} tool: ${name}`;
  }

  registerTool(definition: ToolDefinition) {
    this.tools.set(definition.name, definition);
  }

  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getAllTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getToolsByCategory(category: string): ToolDefinition[] {
    return Array.from(this.tools.values()).filter(tool => tool.category === category);
  }

  // Convert to AI SDK tool format
  toAISDKTools(userContext?: { userId: string; tenantId: string }) {
    const aiTools: Record<string, any> = {};

    for (const [name, definition] of Array.from(this.tools)) {
      aiTools[name] = tool({
        description: definition.description,
        parameters: definition.parameters,
        execute: async (params: any) => {
          // Inject context if required
          if (definition.requiresContext && userContext) {
            params.userId = userContext.userId;
            params.tenantId = userContext.tenantId;
          }
          return definition.execute(params, userContext);
        }
      });
    }

    return aiTools;
  }

  // Get tool execution statistics
  async getToolStats(): Promise<any> {
    const correlationId = this.contextService?.generateCorrelationId() || `stats_${Date.now()}`;
    console.log(`[${correlationId}] Getting comprehensive tool execution statistics`);

    const categories = Array.from(new Set(Array.from(this.tools.values()).map(t => t.category)));
    const categoryStats: Record<string, number> = {};

    for (const category of categories) {
      categoryStats[category] = this.getToolsByCategory(category).length;
    }

    return {
      totalTools: this.tools.size,
      categories: categoryStats,
      tools: Array.from(this.tools.keys()).sort(),
      toolsByCategory: Object.fromEntries(
        categories.map(cat => [cat, this.getToolsByCategory(cat).map(t => t.name).sort()])
      ),
      correlationId
    };
  }
}
