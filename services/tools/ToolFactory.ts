// services/tools/ToolFactory.ts
import { z } from 'zod';
import { tool } from 'ai';
import { ApiDiscovery, RouteDefinition } from './ApiDiscovery';

interface GeneratedTool {
  name: string;
  description: string;
  parameters: z.ZodSchema;
  execute: (params: any, context: any) => Promise<any>;
  category: string;
}

export class ToolFactory {
  constructor(private baseUrl: string, private projectRoot: string) {}

  async generateAllTools(): Promise<GeneratedTool[]> {
    const discovery = new ApiDiscovery(this.projectRoot);
    const routes = await discovery.discoverRoutes();
    
    const tools: GeneratedTool[] = [];

    // Generate API tools
    for (const route of routes) {
      const apiTool = this.generateApiTool(route);
      tools.push(apiTool);
    }

    // Add UI Action Tools
    const uiTools = this.generateUIActionTools();
    tools.push(...uiTools);

    return tools;
  }

  private generateApiTool(route: RouteDefinition): GeneratedTool {
    const toolName = this.generateToolName(route.path, route.method);
    const parameterSchema = this.generateParameterSchema(route);

    return {
      name: toolName,
      description: route.description || `${route.method} ${route.path}`,
      parameters: parameterSchema,
      category: this.categorizeRoute(route.path),
      execute: async (params: any, context: any) => {
        return await this.executeApiCall(route, params, context);
      }
    };
  }

  private generateUIActionTools(): GeneratedTool[] {
    return [
      {
        name: 'navigateToPage',
        description: 'Navigate to different pages within the application',
        parameters: z.object({
          page: z.enum([
            'workshop', 'library', 'file-manager', 'video-analysis',
            'audio-labeling', 'timeline', 'manage', 'upload', 'spatial-preview'
          ]).describe('Target page to navigate to'),
          params: z.record(z.string()).optional().describe('URL parameters for the page')
        }),
        category: 'ui',
        execute: async (params: any) => {
          return {
            action: 'navigate',
            page: params.page,
            params: params.params || {},
            message: `Navigating to ${params.page}`
          };
        }
      },
      {
        name: 'openModal',
        description: 'Open modal dialogs for various functions',
        parameters: z.object({
          modalType: z.enum([
            'canvas', 'project_settings', 'upload', 'export', 'quality_review',
            'collaboration', 'spatial_settings', 'workflow_status'
          ]).describe('Type of modal to open'),
          data: z.record(z.any()).optional().describe('Data to pass to the modal')
        }),
        category: 'ui',
        execute: async (params: any) => {
          return {
            action: 'openModal',
            modalType: params.modalType,
            data: params.data || {},
            message: `Opening ${params.modalType} modal`
          };
        }
      },
      {
        name: 'changeView',
        description: 'Change the view mode or layout of the current interface',
        parameters: z.object({
          viewType: z.enum([
            'grid', 'list', 'timeline', 'spatial', 'canvas', 'preview'
          ]).describe('View type to switch to'),
          options: z.object({
            itemSize: z.enum(['small', 'medium', 'large']).optional(),
            sortBy: z.string().optional(),
            filterBy: z.record(z.any()).optional()
          }).optional().describe('View-specific options')
        }),
        category: 'ui',
        execute: async (params: any) => {
          return {
            action: 'changeView',
            viewType: params.viewType,
            options: params.options || {},
            message: `Switched to ${params.viewType} view`
          };
        }
      },
      {
        name: 'selectContent',
        description: 'Select or deselect content items in the current view',
        parameters: z.object({
          action: z.enum(['select', 'deselect', 'select_all', 'deselect_all']).describe('Selection action'),
          itemIds: z.array(z.string()).optional().describe('Specific item IDs to select/deselect'),
          criteria: z.object({
            mediaType: z.string().optional(),
            dateRange: z.object({
              start: z.string(),
              end: z.string()
            }).optional(),
            tags: z.array(z.string()).optional()
          }).optional().describe('Criteria for bulk selection')
        }),
        category: 'ui',
        execute: async (params: any) => {
          return {
            action: 'selectContent',
            selectionAction: params.action,
            selectedItems: params.itemIds || [],
            message: `${params.action} applied to content`
          };
        }
      },
      {
        name: 'manageSpatialEnvironment',
        description: 'Control spatial environment settings and navigation',
        parameters: z.object({
          action: z.enum([
            'enter_spatial_mode', 'exit_spatial_mode', 'change_camera_angle',
            'adjust_lighting', 'toggle_grid', 'reset_view', 'save_viewpoint'
          ]).describe('Spatial environment action'),
          parameters: z.record(z.any()).optional().describe('Action-specific parameters')
        }),
        category: 'spatial',
        execute: async (params: any) => {
          return {
            action: 'spatialControl',
            spatialAction: params.action,
            parameters: params.parameters || {},
            message: `Spatial environment: ${params.action}`
          };
        }
      },
      {
        name: 'manageWorkflow',
        description: 'Control running workflows - pause, resume, cancel, or modify',
        parameters: z.object({
          workflowId: z.string().describe('ID of the workflow to manage'),
          action: z.enum([
            'pause', 'resume', 'cancel', 'modify', 'get_status', 'get_results'
          ]).describe('Workflow management action'),
          modifications: z.record(z.any()).optional().describe('Modifications to apply if action is modify')
        }),
        category: 'workflow',
        execute: async (params: any) => {
          return {
            action: 'workflowControl',
            workflowId: params.workflowId,
            workflowAction: params.action,
            result: { success: true },
            message: `Workflow ${params.action}: ${params.workflowId}`
          };
        }
      }
    ];
  }

  private generateToolName(path: string, method: string): string {
    // Convert /api/unified-search to searchUnified
    const pathParts = path.split('/').filter(p => p && p !== 'api');
    const camelCasePath = pathParts
      .map((part, index) =>
        index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)
      )
      .join('');

    const methodPrefix = method.toLowerCase();
    return `${methodPrefix}${camelCasePath.charAt(0).toUpperCase() + camelCasePath.slice(1)}`;
  }

  private generateParameterSchema(route: RouteDefinition): z.ZodSchema {
    // For now, create a flexible schema that accepts common parameters
    // In a full implementation, this would analyze the actual route function
    const baseSchema = z.object({
      userId: z.string().describe('User ID for context tracking').optional()
    });

    // Add route-specific parameters based on path patterns
    if (route.path.includes('search')) {
      return baseSchema.extend({
        query: z.string().describe('Search query'),
        limit: z.number().optional().describe('Maximum results'),
        type: z.string().optional().describe('Content type filter')
      });
    }

    if (route.path.includes('canvas')) {
      return baseSchema.extend({
        canvasId: z.string().optional().describe('Canvas ID'),
        name: z.string().optional().describe('Canvas name'),
        items: z.array(z.any()).optional().describe('Items to add')
      });
    }

    if (route.path.includes('generate')) {
      return baseSchema.extend({
        prompt: z.string().describe('Generation prompt'),
        type: z.enum(['image', 'video', 'audio', 'text']).optional(),
        model: z.string().optional().describe('Model to use')
      });
    }

    // Generic schema for other endpoints
    return z.record(z.any()).describe('Request parameters');
  }

  private categorizeRoute(path: string): string {
    if (path.includes('search')) return 'search';
    if (path.includes('canvas')) return 'canvas';
    if (path.includes('generate')) return 'generation';
    if (path.includes('upload')) return 'upload';
    if (path.includes('media')) return 'media';
    if (path.includes('layout')) return 'layout';
    if (path.includes('project')) return 'project';
    if (path.includes('lora')) return 'training';
    if (path.includes('health') || path.includes('debug')) return 'system';
    return 'general';
  }

  private async executeApiCall(
    route: RouteDefinition,
    params: any,
    context: any
  ): Promise<any> {
    let url = `${this.baseUrl}${route.path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Inject tenant context
    if (context.tenantId) {
      headers['X-Tenant-ID'] = context.tenantId;
    }

    if (context.userId) {
      headers['X-User-ID'] = context.userId;
    }

    const requestOptions: RequestInit = {
      method: route.method,
      headers,
    };

    if (route.method !== 'GET' && params) {
      requestOptions.body = JSON.stringify(params);
    } else if (route.method === 'GET' && params) {
      // Add query parameters for GET requests
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      });
      const queryString = searchParams.toString();
      if (queryString) {
        url += (url.includes('?') ? '&' : '?') + queryString;
      }
    }

    try {
      const response = await fetch(url, requestOptions);

      if (!response.ok) {
        throw new Error(`API call failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      
      // Return in action format for UI consumption
      return {
        action: this.generateActionName(route.path, route.method),
        payload: result,
        success: true
      };
    } catch (error) {
      throw new Error(`Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private generateActionName(path: string, method: string): string {
    // Convert /api/unified-search to searchUnified action
    const pathParts = path.split('/').filter(p => p && p !== 'api');
    const camelCasePath = pathParts
      .map((part, index) =>
        index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)
      )
      .join('');

    if (method === 'GET' && camelCasePath.startsWith('get')) {
      return camelCasePath;
    }
    
    const methodPrefix = method.toLowerCase();
    return `${methodPrefix}${camelCasePath.charAt(0).toUpperCase() + camelCasePath.slice(1)}`;
  }
}
