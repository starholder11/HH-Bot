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
      const filePath = path.join(this.projectRoot, file);
      const sourceFile = this.program.getSourceFile(filePath);

      if (sourceFile) {
        const fileRoutes = this.analyzeRouteFile(sourceFile, file);
        routes.push(...fileRoutes);
      }
    }

    return routes;
  }

  private analyzeRouteFile(sourceFile: ts.SourceFile, filePath: string): RouteDefinition[] {
    const routes: RouteDefinition[] = [];
    const routePath = this.extractRoutePath(filePath);

    ts.forEachChild(sourceFile, (node) => {
      if (ts.isFunctionDeclaration(node) && node.name) {
        const methodName = node.name.text;
        const httpMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

        if (httpMethods.includes(methodName)) {
          const route = this.analyzeRouteFunction(node, routePath, methodName);
          if (route) {
            routes.push(route);
          }
        }
      }
    });

    return routes;
  }

  private analyzeRouteFunction(
    node: ts.FunctionDeclaration,
    routePath: string,
    method: string
  ): RouteDefinition | null {
    const parameters: ParameterDefinition[] = [];
    
    // Extract JSDoc comments for description
    const jsDocTags = ts.getJSDocTags(node);
    const description = jsDocTags
      .find(tag => tag.tagName.text === 'description')
      ?.comment?.toString();

    // For now, use simplified parameter extraction
    // In a full implementation, this would analyze the function body for req.json(), req.query, etc.
    
    return {
      path: routePath,
      method,
      parameters,
      responseType: 'any',
      description
    };
  }

  private extractRoutePath(filePath: string): string {
    // Convert file path to API route path
    // app/api/unified-search/route.ts -> /api/unified-search
    const apiPath = filePath
      .replace('app/api/', '')
      .replace('/route.ts', '')
      .replace(/\[([^\]]+)\]/g, ':$1'); // Convert [param] to :param

    return `/api/${apiPath}`;
  }
}
