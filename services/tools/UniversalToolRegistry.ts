// services/tools/UniversalToolRegistry.ts
import { z } from 'zod';
import { ToolFactory } from './ToolFactory';
import { ComprehensiveTools } from './ComprehensiveTools';
import { RedisContextService } from '../context/RedisContextService';

export interface UniversalToolDefinition {
  name: string;
  description: string;
  parameters: z.ZodSchema;
  execute: (params: any, context?: any) => Promise<any>;
  category: string;
  requiresContext?: boolean;
}

export class UniversalToolRegistry {
  private tools: Map<string, UniversalToolDefinition> = new Map();
  private toolFactory: ToolFactory;
  private comprehensiveTools: ComprehensiveTools;

  constructor(
    contextService: RedisContextService,
    baseUrl: string,
    projectRoot: string
  ) {
    this.toolFactory = new ToolFactory(baseUrl, projectRoot);
    this.comprehensiveTools = new ComprehensiveTools(
      contextService,
      {
        get: async (url: string) => {
          const response = await fetch(`${baseUrl}${url}`);
          return await response.json();
        },
        post: async (url: string, data: any) => {
          const response = await fetch(`${baseUrl}${url}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          });
          return await response.json();
        },
        put: async (url: string, data: any) => {
          const response = await fetch(`${baseUrl}${url}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          });
          return await response.json();
        },
        patch: async (url: string, data: any) => {
          const response = await fetch(`${baseUrl}${url}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          });
          return await response.json();
        },
        delete: async (url: string) => {
          const response = await fetch(`${baseUrl}${url}`, {
            method: 'DELETE'
          });
          return await response.json();
        }
      }
    );
  }

  async initializeAllTools(): Promise<void> {
    console.log('[UniversalToolRegistry] Initializing all tools...');

    // 1. Register comprehensive tools (manually curated, high-quality)
    const comprehensiveToolDefs = ComprehensiveTools.getAllTools();
    for (const toolDef of comprehensiveToolDefs) {
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

    // 2. Generate and register API tools (auto-discovered)
    try {
      const generatedTools = await this.toolFactory.generateAllTools();
      for (const tool of generatedTools) {
        // Don't override comprehensive tools with generated ones
        if (!this.tools.has(tool.name)) {
          this.registerTool({
            name: tool.name,
            description: tool.description,
            category: tool.category,
            parameters: tool.parameters,
            requiresContext: false,
            execute: tool.execute
          });
        }
      }
    } catch (error) {
      console.warn('[UniversalToolRegistry] Failed to generate API tools:', error);
    }

    console.log(`[UniversalToolRegistry] Registered ${this.tools.size} total tools`);
  }

  registerTool(tool: UniversalToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  getTool(name: string): UniversalToolDefinition | undefined {
    return this.tools.get(name);
  }

  getAllTools(): Map<string, UniversalToolDefinition> {
    return new Map(this.tools);
  }

  getToolsByCategory(category: string): UniversalToolDefinition[] {
    return Array.from(this.tools.values()).filter(tool => tool.category === category);
  }

  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  getAllTools(): Map<string, UniversalToolDefinition> {
    return this.tools;
  }

  // Convert tools to AI SDK format
  getAISDKTools(): Record<string, any> {
    const aiTools: Record<string, any> = {};

    for (const [name, toolDef] of this.tools) {
      aiTools[name] = tool({
        description: toolDef.description,
        parameters: toolDef.parameters,
        execute: toolDef.execute
      });
    }

    return aiTools;
  }

  private getToolDescription(name: string, category: string): string {
    const descriptions: Record<string, string> = {
      // Search & Discovery
      'searchUnified': 'Search for multimedia content across the entire platform',
      'searchKeyframes': 'Search for specific video keyframes and timestamps',

      // Asset Management
      'listMediaAssets': 'List and browse media assets with filtering options',
      'getMediaAsset': 'Get detailed information about a specific media asset',
      'renameAsset': 'Rename or retitle media assets',
      'updateAsset': 'Update metadata and properties of media assets',

      // Layout Management
      'listLayouts': 'Browse and manage layout templates and arrangements',
      'duplicateLayout': 'Create copies of existing layouts for modification',

      // Canvas Management
      'createCanvas': 'Create new canvas collections for organizing content',
      'listCanvases': 'Browse existing canvas collections',
      'getCanvas': 'Get detailed canvas information and contents',
      'updateCanvas': 'Modify canvas properties and arrangements',
      'pinToCanvas': 'Pin content items to canvas collections',

      // LoRA & Training
      'listLoras': 'List available LoRA models for image generation',
      'getCanvasLoras': 'Get LoRA models associated with specific canvases',
      'trainLora': 'Train new LoRA models from canvas content',

      // Generation & AI
      'generateContent': 'Generate images, videos, or audio using AI models',
      'prepareGenerate': 'Set up generation parameters and options',

      // Project Management
      'createProject': 'Create new creative projects',
      'listProjects': 'Browse existing projects',
      'updateProject': 'Modify project settings and metadata',

      // Quality Control
      'reviewContent': 'Review and assess content quality',
      'flagContent': 'Flag content for review or removal',

      // Chat & Communication
      'chat': 'Handle general conversation and questions',

      // UI Actions
      'navigateToPage': 'Navigate to different application pages',
      'openModal': 'Open modal dialogs and interfaces',
      'changeView': 'Change view modes and layouts',
      'selectContent': 'Select and manage content items',
      'manageSpatialEnvironment': 'Control 3D spatial environments',
      'manageWorkflow': 'Control workflow execution and status'
    };

    return descriptions[name] || `${category} tool: ${name}`;
  }
}
