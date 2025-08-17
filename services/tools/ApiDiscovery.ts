// services/tools/ApiDiscovery.ts
import * as path from 'path';
import * as fs from 'fs';

export interface RouteDefinition {
  path: string;
  method: string;
  parameters: ParameterDefinition[];
  responseType: string;
  description?: string;
}

export interface ParameterDefinition {
  name: string;
  type: string;
  required: boolean;
  description?: string;
}

export class ApiDiscovery {
  constructor(private projectRoot: string) {}

  async discoverRoutes(): Promise<RouteDefinition[]> {
    const routes: RouteDefinition[] = [];
    
    // Find all route files in app/api
    const apiDir = path.join(this.projectRoot, 'app', 'api');
    
    try {
      const routeFiles = await this.findRouteFiles(apiDir);
      
      for (const routeFile of routeFiles) {
        const routeDefinitions = this.extractRouteDefinitionsFromPath(routeFile);
        routes.push(...routeDefinitions);
      }
    } catch (error) {
      console.warn('API discovery failed, using fallback routes:', error);
      // Return basic routes for known endpoints
      return this.getFallbackRoutes();
    }
    
    return routes;
  }

  private async findRouteFiles(apiDir: string): Promise<string[]> {
    const routeFiles: string[] = [];
    
    const scanDirectory = (dir: string, basePath: string = '') => {
      if (!fs.existsSync(dir)) return;
      
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.join(basePath, entry.name);
        
        if (entry.isDirectory()) {
          scanDirectory(fullPath, relativePath);
        } else if (entry.name === 'route.ts' || entry.name === 'route.js') {
          routeFiles.push(relativePath.replace(/[\\\/]route\.(ts|js)$/, ''));
        }
      }
    };
    
    scanDirectory(apiDir);
    return routeFiles;
  }

  private extractRouteDefinitionsFromPath(routePath: string): RouteDefinition[] {
    const routes: RouteDefinition[] = [];
    const apiPath = '/api/' + routePath.replace(/\\/g, '/');
    
    // For each route path, assume common HTTP methods
    const methods = this.getMethodsForRoute(routePath);
    
    for (const method of methods) {
      routes.push({
        path: apiPath,
        method: method,
        parameters: this.getParametersForRoute(routePath, method),
        responseType: 'any',
        description: `${method} ${apiPath}`
      });
    }
    
    return routes;
  }

  private getMethodsForRoute(routePath: string): string[] {
    // Determine likely methods based on route name
    if (routePath.includes('health') || routePath.includes('debug')) {
      return ['GET'];
    }
    
    if (routePath.includes('upload') || routePath.includes('generate')) {
      return ['POST'];
    }
    
    if (routePath.includes('search') || routePath.includes('list')) {
      return ['GET', 'POST'];
    }
    
    // Default to common methods
    return ['GET', 'POST'];
  }

  private getParametersForRoute(routePath: string, method: string): ParameterDefinition[] {
    const params: ParameterDefinition[] = [];
    
    if (method === 'GET') {
      // GET methods typically use query parameters
      if (routePath.includes('search')) {
        params.push({
          name: 'query',
          type: 'string',
          required: true,
          description: 'Search query'
        });
      }
    } else if (method === 'POST') {
      // POST methods typically use request body
      if (routePath.includes('generate')) {
        params.push({
          name: 'prompt',
          type: 'string',
          required: true,
          description: 'Generation prompt'
        });
      } else if (routePath.includes('search')) {
        params.push({
          name: 'query',
          type: 'string',
          required: true,
          description: 'Search query'
        });
      }
    }
    
    return params;
  }

  private getFallbackRoutes(): RouteDefinition[] {
    // Hardcoded fallback routes for known endpoints
    return [
      {
        path: '/api/health',
        method: 'GET',
        parameters: [],
        responseType: 'any',
        description: 'Health check endpoint'
      },
      {
        path: '/api/unified-search',
        method: 'POST',
        parameters: [
          { name: 'query', type: 'string', required: true, description: 'Search query' }
        ],
        responseType: 'any',
        description: 'Unified search endpoint'
      }
    ];
  }
}