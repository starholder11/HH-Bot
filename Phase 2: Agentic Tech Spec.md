# Phase 2: Agentic Tech Spec

## Executive Summary

This technical specification provides implementation guidance for the vertical slice approach outlined in the Phase 2: Agentic Task Sequencing document. The focus is on delivering a working end-to-end workflow quickly, with Redis-based context management, correlation ID tracing, and simplified tool coverage.

The specification prioritizes practical implementations that can ship within 4 weeks, deferring complex features until the core interaction model is validated. All implementations use established patterns and avoid over-engineering for hypothetical requirements.

## Phase 1: Vertical Slice Foundation - Technical Implementation

### Week 1: Core Infrastructure with Redis Context

#### LangGraph Integration and Setup

**Technology Stack:**
- **ElastiCache Redis 7+** in existing VPC `vpc-45bdcd38` as primary context store
- **RDS Aurora Serverless PostgreSQL 15+** in existing VPC for workflow execution logs
- **LangGraph 0.2+** for basic workflow orchestration
- **ECS Fargate containers** deployed to existing cluster `hh-bot-lancedb-cluster`
- **Existing ALB** `lancedb-bulletproof-simple-alb-705151448.us-east-1.elb.amazonaws.com` for routing
- Correlation IDs for request tracing

**Deployment Strategy:**
- **Extend existing CloudFormation templates** in `/infrastructure/` directory
- **Use existing ECR repository** pattern: `781939061434.dkr.ecr.us-east-1.amazonaws.com/`
- **Leverage existing IAM roles** and security groups where possible
- **Add new ECS services** to existing cluster rather than creating new infrastructure

**Database Schema:**
```sql
-- Workflow execution state
CREATE TABLE workflow_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    workflow_type VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    input_data JSONB NOT NULL,
    current_state JSONB,
    output_data JSONB,
    error_details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Workflow step tracking
CREATE TABLE workflow_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id UUID REFERENCES workflow_executions(id),
    step_name VARCHAR(255) NOT NULL,
    step_type VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    input_data JSONB,
    output_data JSONB,
    error_details JSONB,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER
);

-- Workflow templates
CREATE TABLE workflow_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    template_data JSONB NOT NULL,
    version INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_workflow_executions_tenant_user ON workflow_executions(tenant_id, user_id);
CREATE INDEX idx_workflow_executions_status ON workflow_executions(status);
CREATE INDEX idx_workflow_steps_execution ON workflow_steps(execution_id);
```

**Redis Context Service Implementation:**
```typescript
// services/context/RedisContextService.ts
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';

interface UserContext {
  userId: string;
  tenantId: string;
  sessionId: string;
  activeProjects: string[];
  recentSearches: string[];
  canvasItems: any[];
  preferences: UserPreferences;
  lastActivity: string;
}

interface WorkflowState {
  executionId: string;
  tenantId: string;
  userId: string;
  correlationId: string;
  currentStep: string;
  context: Record<string, any>;
  results: Record<string, any>;
  errors: Array<{ step: string; error: string; timestamp: string }>;
}

export class RedisContextService {
  private redis: Redis;
  private readonly CONTEXT_TTL = 24 * 60 * 60; // 24 hours
  private readonly WORKFLOW_TTL = 7 * 24 * 60 * 60; // 7 days

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl);
  }

  async getUserContext(userId: string, tenantId: string): Promise<UserContext | null> {
    const key = `context:${tenantId}:${userId}`;
    const data = await this.redis.get(key);

    if (!data) {
      return null;
    }

    return JSON.parse(data);
  }

  async updateUserContext(context: UserContext): Promise<void> {
    const key = `context:${context.tenantId}:${context.userId}`;
    context.lastActivity = new Date().toISOString();

    await this.redis.setex(key, this.CONTEXT_TTL, JSON.stringify(context));
  }

  async getWorkflowState(executionId: string): Promise<WorkflowState | null> {
    const key = `workflow:${executionId}`;
    const data = await this.redis.get(key);

    return data ? JSON.parse(data) : null;
  }

  async updateWorkflowState(state: WorkflowState): Promise<void> {
    const key = `workflow:${state.executionId}`;
    await this.redis.setex(key, this.WORKFLOW_TTL, JSON.stringify(state));
  }

  generateCorrelationId(): string {
    return `corr_${Date.now()}_${uuidv4().slice(0, 8)}`;
  }
}

  private initializeWorkflows() {
    // Create video project workflow
    const createVideoProjectWorkflow = new StateGraph<WorkflowState>({
      channels: {
        executionId: { value: null },
        tenantId: { value: null },
        userId: { value: null },
        currentStep: { value: "start" },
        context: { value: {} },
        results: { value: {} },
        errors: { value: [] }
      }
    });

    createVideoProjectWorkflow
      .addNode("validateInput", this.validateInputNode)
      .addNode("createProject", this.createProjectNode)
      .addNode("searchContent", this.searchContentNode)
      .addNode("analyzeContent", this.analyzeContentNode)
      .addNode("generateLayout", this.generateLayoutNode)
      .addNode("finalizeProject", this.finalizeProjectNode)
      .addEdge(START, "validateInput")
      .addEdge("validateInput", "createProject")
      .addEdge("createProject", "searchContent")
      .addEdge("searchContent", "analyzeContent")
      .addEdge("analyzeContent", "generateLayout")
      .addEdge("generateLayout", "finalizeProject")
      .addEdge("finalizeProject", END);

    this.workflows.set("create_video_project", createVideoProjectWorkflow);
  }

  async executeWorkflow(
    workflowType: string,
    input: any,
    tenantId: string,
    userId: string
  ): Promise<string> {
    const executionId = crypto.randomUUID();

    // Create execution record
    await this.db.query(`
      INSERT INTO workflow_executions (id, tenant_id, user_id, workflow_type, input_data, status)
      VALUES ($1, $2, $3, $4, $5, 'running')
    `, [executionId, tenantId, userId, workflowType, JSON.stringify(input)]);

    const workflow = this.workflows.get(workflowType);
    if (!workflow) {
      throw new Error(`Unknown workflow type: ${workflowType}`);
    }

    const initialState: WorkflowState = {
      executionId,
      tenantId,
      userId,
      currentStep: "start",
      context: input,
      results: {},
      errors: []
    };

    // Execute workflow with checkpointing
    const app = workflow.compile({ checkpointer: this.checkpointSaver });

    try {
      const result = await app.invoke(initialState, {
        configurable: { thread_id: executionId }
      });

      await this.db.query(`
        UPDATE workflow_executions
        SET status = 'completed', output_data = $2, completed_at = NOW()
        WHERE id = $1
      `, [executionId, JSON.stringify(result)]);

      return executionId;
    } catch (error) {
      await this.db.query(`
        UPDATE workflow_executions
        SET status = 'failed', error_details = $2, completed_at = NOW()
        WHERE id = $1
      `, [executionId, JSON.stringify({ error: error.message })]);

      throw error;
    }
  }

  private validateInputNode = async (state: WorkflowState): Promise<WorkflowState> => {
    const stepStart = Date.now();

    try {
      // Validate input according to workflow requirements
      const validation = await this.validateWorkflowInput(state.context);

      if (!validation.valid) {
        throw new Error(`Input validation failed: ${validation.errors.join(', ')}`);
      }

      await this.recordStepCompletion(
        state.executionId,
        "validateInput",
        "validation",
        state.context,
        { valid: true },
        stepStart
      );

      return {
        ...state,
        currentStep: "createProject",
        results: { ...state.results, validation: { valid: true } }
      };
    } catch (error) {
      await this.recordStepError(state.executionId, "validateInput", error.message, stepStart);
      throw error;
    }
  };

  private async recordStepCompletion(
    executionId: string,
    stepName: string,
    stepType: string,
    input: any,
    output: any,
    startTime: number
  ) {
    const duration = Date.now() - startTime;

    await this.db.query(`
      INSERT INTO workflow_steps
      (execution_id, step_name, step_type, status, input_data, output_data, started_at, completed_at, duration_ms)
      VALUES ($1, $2, $3, 'completed', $4, $5, $6, NOW(), $7)
    `, [
      executionId, stepName, stepType, JSON.stringify(input),
      JSON.stringify(output), new Date(startTime), duration
    ]);
  }

  private async recordStepError(
    executionId: string,
    stepName: string,
    error: string,
    startTime: number
  ) {
    const duration = Date.now() - startTime;

    await this.db.query(`
      INSERT INTO workflow_steps
      (execution_id, step_name, step_type, status, error_details, started_at, completed_at, duration_ms)
      VALUES ($1, $2, 'error', 'failed', $3, $4, NOW(), $5)
    `, [executionId, stepName, JSON.stringify({ error }), new Date(startTime), duration]);
  }
}
```

**Service Architecture Implementation:**
```typescript
// services/orchestration/OrchestrationService.ts
import express from 'express';
import { WorkflowOrchestrator } from './WorkflowOrchestrator';
import { authenticateRequest, extractTenantContext } from '../middleware/auth';

export class OrchestrationService {
  private app: express.Application;
  private orchestrator: WorkflowOrchestrator;

  constructor(orchestrator: WorkflowOrchestrator) {
    this.app = express();
    this.orchestrator = orchestrator;
    this.setupRoutes();
  }

  private setupRoutes() {
    this.app.use(express.json());
    this.app.use(authenticateRequest);
    this.app.use(extractTenantContext);

    // Execute workflow
    this.app.post('/workflows/execute', async (req, res) => {
      try {
        const { workflowType, input } = req.body;
        const { tenantId, userId } = req.context;

        const executionId = await this.orchestrator.executeWorkflow(
          workflowType,
          input,
          tenantId,
          userId
        );

        res.json({ success: true, executionId });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Get workflow status
    this.app.get('/workflows/:executionId/status', async (req, res) => {
      try {
        const { executionId } = req.params;
        const { tenantId } = req.context;

        const execution = await this.getWorkflowStatus(executionId, tenantId);
        res.json({ success: true, execution });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'healthy', timestamp: new Date().toISOString() });
    });
  }

  private async getWorkflowStatus(executionId: string, tenantId: string) {
    const result = await this.db.query(`
      SELECT e.*,
             array_agg(
               json_build_object(
                 'stepName', s.step_name,
                 'status', s.status,
                 'duration', s.duration_ms,
                 'completedAt', s.completed_at
               ) ORDER BY s.started_at
             ) as steps
      FROM workflow_executions e
      LEFT JOIN workflow_steps s ON e.id = s.execution_id
      WHERE e.id = $1 AND e.tenant_id = $2
      GROUP BY e.id
    `, [executionId, tenantId]);

    return result.rows[0];
  }

  listen(port: number) {
    this.app.listen(port, () => {
      console.log(`Orchestration service listening on port ${port}`);
    });
  }
}
```

#### AWS Infrastructure Setup

**Existing Infrastructure to Extend:**
- **AWS Account**: `781939061434`
- **VPC**: `vpc-45bdcd38` (existing, contains LanceDB service)
- **ECS Cluster**: `hh-bot-lancedb-cluster` (existing)
- **S3 Bucket**: `hh-bot-images-2025-prod` (existing)
- **Secrets Manager**: OpenAI API key already stored at `arn:aws:secretsmanager:us-east-1:781939061434:secret:openai-api-key-plain-ObIbHG`

**New Infrastructure to Add:**
- **ElastiCache Redis**: Add to existing VPC for context management
- **RDS Aurora Serverless**: Add to existing VPC for workflow logging
- **New ECS Services**: Context and Orchestration services in existing cluster

**ECS Task Definition for Context Service:**
```json
{
  "family": "hh-bot-context-service",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "2048",
  "executionRoleArn": "arn:aws:iam::781939061434:role/hh-bot-lancedb-task-execution-role",
  "taskRoleArn": "arn:aws:iam::781939061434:role/hh-bot-lancedb-task-role",
  "containerDefinitions": [
    {
      "name": "context-service",
      "image": "781939061434.dkr.ecr.us-east-1.amazonaws.com/hh-bot-context-service:latest",
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        },
        {
          "name": "REDIS_URL",
          "value": "redis://hh-bot-elasticache.cache.amazonaws.com:6379"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/orchestration-service",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:3000/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3
      }
    }
  ]
}
```

### Week 2: Essential Tool Coverage

#### Manual Tool Creation

**Core API Tools Implementation:**
```typescript
// services/tools/CoreTools.ts
import { tool } from 'ai';
import { z } from 'zod';

export class CoreTools {
  constructor(
    private contextService: RedisContextService,
    private apiClient: ApiClient
  ) {}

  searchUnifiedTool = tool({
    description: 'Search for multimedia content across the platform',
    parameters: z.object({
      query: z.string().describe('Search query'),
      mediaType: z.enum(['image', 'video', 'audio', 'text', 'all']).optional(),
      limit: z.number().min(1).max(50).default(20)
    }),
    execute: async (params, context) => {
      const correlationId = this.contextService.generateCorrelationId();

      try {
        console.log(`[${correlationId}] Executing unified search:`, params);

        const results = await this.apiClient.post('/api/unified-search', {
          ...params,
          tenantId: context.tenantId,
          userId: context.userId
        }, {
          headers: {
            'X-Correlation-ID': correlationId,
            'X-Tenant-ID': context.tenantId,
            'X-User-ID': context.userId
          }
        });

        // Update user context with search
        const userContext = await this.contextService.getUserContext(context.userId, context.tenantId);
        if (userContext) {
          userContext.recentSearches.unshift(params.query);
          userContext.recentSearches = userContext.recentSearches.slice(0, 10);
          await this.contextService.updateUserContext(userContext);
        }

        console.log(`[${correlationId}] Search completed:`, results.data.length, 'results');
        return results.data;
      } catch (error) {
        console.error(`[${correlationId}] Search failed:`, error.message);
        throw new Error(`Search failed: ${error.message}`);
      }
    }
  });

  createCanvasTool = tool({
    description: 'Create a new canvas collection for organizing content',
    parameters: z.object({
      name: z.string().describe('Name for the canvas'),
      description: z.string().optional().describe('Description of the canvas purpose')
    }),
    execute: async (params, context) => {
      const correlationId = this.contextService.generateCorrelationId();

      try {
        console.log(`[${correlationId}] Creating canvas:`, params);

        const canvas = await this.apiClient.post('/api/canvas', {
          ...params,
          tenantId: context.tenantId,
          userId: context.userId
        }, {
          headers: {
            'X-Correlation-ID': correlationId,
            'X-Tenant-ID': context.tenantId,
            'X-User-ID': context.userId
          }
        });

        console.log(`[${correlationId}] Canvas created:`, canvas.data.id);
        return canvas.data;
      } catch (error) {
        console.error(`[${correlationId}] Canvas creation failed:`, error.message);
        throw new Error(`Canvas creation failed: ${error.message}`);
      }
    }
  });

  pinToCanvasTool = tool({
    description: 'Pin content items to a canvas',
    parameters: z.object({
      canvasId: z.string().describe('ID of the target canvas'),
      contentIds: z.array(z.string()).describe('Array of content IDs to pin'),
      arrangement: z.enum(['grid', 'freeform', 'timeline']).default('grid')
    }),
    execute: async (params, context) => {
      const correlationId = this.contextService.generateCorrelationId();

      try {
        console.log(`[${correlationId}] Pinning to canvas:`, params);

        const result = await this.apiClient.post(`/api/canvas/${params.canvasId}/pin`, {
          contentIds: params.contentIds,
          arrangement: params.arrangement,
          tenantId: context.tenantId,
          userId: context.userId
        }, {
          headers: {
            'X-Correlation-ID': correlationId,
            'X-Tenant-ID': context.tenantId,
            'X-User-ID': context.userId
          }
        });

        console.log(`[${correlationId}] Content pinned:`, params.contentIds.length, 'items');
        return result.data;
      } catch (error) {
        console.error(`[${correlationId}] Pin operation failed:`, error.message);
        throw new Error(`Pin operation failed: ${error.message}`);
      }
    }
  });

  getAllCoreTools() {
    return {
      searchUnified: this.searchUnifiedTool,
      createCanvas: this.createCanvasTool,
      pinToCanvas: this.pinToCanvasTool
    };
  }
}

  async discoverRoutes(): Promise<RouteDefinition[]> {
    const routeFiles = await glob('app/api/**/route.ts', {
      cwd: this.projectRoot
    });

    const routes: RouteDefinition[] = [];

    for (const file of routeFiles) {
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
    const signature = this.checker.getSignatureFromDeclaration(node);

    if (signature) {
      // Analyze request parameter (usually first parameter)
      const requestParam = signature.parameters[0];
      if (requestParam) {
        const requestType = this.checker.getTypeOfSymbolAtLocation(
          requestParam,
          requestParam.valueDeclaration!
        );

        // Extract parameters from request body, query, etc.
        const extractedParams = this.extractParametersFromType(requestType);
        parameters.push(...extractedParams);
      }
    }

    // Extract JSDoc comments for description
    const jsDocTags = ts.getJSDocTags(node);
    const description = jsDocTags
      .find(tag => tag.tagName.text === 'description')
      ?.comment?.toString();

    return {
      path: routePath,
      method,
      parameters,
      responseType: 'any', // Could be enhanced to extract actual response types
      description
    };
  }

  private extractParametersFromType(type: ts.Type): ParameterDefinition[] {
    const parameters: ParameterDefinition[] = [];

    // This would need to be enhanced to properly extract parameter types
    // from NextRequest body parsing, query parameters, etc.

    return parameters;
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
```

**Tool Generator Implementation:**
```typescript
// tools/api-discovery/ToolGenerator.ts
import { z } from 'zod';
import { tool } from 'ai';

interface GeneratedTool {
  name: string;
  description: string;
  parameters: z.ZodSchema;
  execute: (params: any, context: any) => Promise<any>;
}

export class ToolGenerator {
  constructor(private baseUrl: string) {}

  generateToolsFromRoutes(routes: RouteDefinition[]): GeneratedTool[] {
    return routes.map(route => this.generateTool(route));
  }

  private generateTool(route: RouteDefinition): GeneratedTool {
    const toolName = this.generateToolName(route.path, route.method);
    const parameterSchema = this.generateParameterSchema(route.parameters);

    return {
      name: toolName,
      description: route.description || `${route.method} ${route.path}`,
      parameters: parameterSchema,
      execute: async (params: any, context: any) => {
        return await this.executeApiCall(route, params, context);
      }
    };
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

  private generateParameterSchema(parameters: ParameterDefinition[]): z.ZodSchema {
    const schemaFields: Record<string, z.ZodTypeAny> = {};

    for (const param of parameters) {
      let fieldSchema: z.ZodTypeAny;

      switch (param.type) {
        case 'string':
          fieldSchema = z.string();
          break;
        case 'number':
          fieldSchema = z.number();
          break;
        case 'boolean':
          fieldSchema = z.boolean();
          break;
        case 'array':
          fieldSchema = z.array(z.string());
          break;
        default:
          fieldSchema = z.any();
      }

      if (!param.required) {
        fieldSchema = fieldSchema.optional();
      }

      if (param.description) {
        fieldSchema = fieldSchema.describe(param.description);
      }

      schemaFields[param.name] = fieldSchema;
    }

    return z.object(schemaFields);
  }

  private async executeApiCall(
    route: RouteDefinition,
    params: any,
    context: any
  ): Promise<any> {
    const url = `${this.baseUrl}${route.path}`;
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
    }

    try {
      const response = await fetch(url, requestOptions);

      if (!response.ok) {
        throw new Error(`API call failed: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      throw new Error(`Tool execution failed: ${error.message}`);
    }
  }
}
```

#### Tool Registry System

**Tool Registry Implementation:**
```typescript
// services/tools/ToolRegistry.ts
interface ToolMetadata {
  name: string;
  description: string;
  category: string;
  parameters: any;
  executionContext: string[];
  dependencies: string[];
  costLevel: 'low' | 'medium' | 'high';
  averageExecutionTime: number;
  successRate: number;
  lastUpdated: Date;
}

export class ToolRegistry {
  private tools: Map<string, any> = new Map();
  private metadata: Map<string, ToolMetadata> = new Map();
  private performanceMetrics: Map<string, PerformanceMetric[]> = new Map();

  constructor(private db: Database) {
    this.loadToolsFromDatabase();
  }

  async registerTool(name: string, tool: any, metadata: ToolMetadata) {
    this.tools.set(name, tool);
    this.metadata.set(name, metadata);

    // Persist to database
    await this.db.query(`
      INSERT INTO tool_registry (name, metadata, tool_definition, created_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (name) DO UPDATE SET
        metadata = $2,
        tool_definition = $3,
        updated_at = NOW()
    `, [name, JSON.stringify(metadata), JSON.stringify(tool)]);
  }

  getTool(name: string): any {
    return this.tools.get(name);
  }

  getToolsByCategory(category: string): string[] {
    return Array.from(this.metadata.entries())
      .filter(([_, metadata]) => metadata.category === category)
      .map(([name, _]) => name);
  }

  async recordToolExecution(
    toolName: string,
    executionTime: number,
    success: boolean,
    error?: string
  ) {
    const metric: PerformanceMetric = {
      timestamp: new Date(),
      executionTime,
      success,
      error
    };

    if (!this.performanceMetrics.has(toolName)) {
      this.performanceMetrics.set(toolName, []);
    }

    this.performanceMetrics.get(toolName)!.push(metric);

    // Update metadata
    const metadata = this.metadata.get(toolName);
    if (metadata) {
      const metrics = this.performanceMetrics.get(toolName)!;
      const recentMetrics = metrics.slice(-100); // Keep last 100 executions

      metadata.averageExecutionTime = recentMetrics.reduce(
        (sum, m) => sum + m.executionTime, 0
      ) / recentMetrics.length;

      metadata.successRate = recentMetrics.filter(m => m.success).length / recentMetrics.length;
      metadata.lastUpdated = new Date();

      this.metadata.set(toolName, metadata);
    }

    // Persist metrics
    await this.db.query(`
      INSERT INTO tool_performance_metrics
      (tool_name, execution_time, success, error_message, created_at)
      VALUES ($1, $2, $3, $4, NOW())
    `, [toolName, executionTime, success, error]);
  }

  private async loadToolsFromDatabase() {
    const result = await this.db.query(`
      SELECT name, metadata, tool_definition
      FROM tool_registry
      WHERE is_active = true
    `);

    for (const row of result.rows) {
      const metadata = JSON.parse(row.metadata);
      const toolDefinition = JSON.parse(row.tool_definition);

      this.tools.set(row.name, toolDefinition);
      this.metadata.set(row.name, metadata);
    }
  }
}

interface PerformanceMetric {
  timestamp: Date;
  executionTime: number;
  success: boolean;
  error?: string;
}
```

### Week 3: Agent Intelligence

#### Simplified LiteLLM Integration

**Simplified LiteLLM Service:**
```typescript
// services/model-routing/SimpleLLMService.ts
import { LiteLLM } from 'litellm';

interface ModelConfig {
  model: string;
  provider: string;
  apiKey: string;
  costPerToken: number;
}

export class SimpleLLMService {
  private client: LiteLLM;
  private models: ModelConfig[];
  private costTracking: Map<string, number> = new Map();

  constructor() {
    this.client = new LiteLLM();
    this.models = [
      {
        model: 'gpt-4o',
        provider: 'openai',
        apiKey: process.env.OPENAI_API_KEY!,
        costPerToken: 0.00003
      },
      {
        model: 'claude-3-5-sonnet-20241022',
        provider: 'anthropic',
        apiKey: process.env.ANTHROPIC_API_KEY!,
        costPerToken: 0.000015
      }
    ];
  }

  async routeRequest(
    messages: any[],
    options: {
      correlationId: string;
      userId: string;
      tenantId: string;
      maxCost?: number;
    }
  ): Promise<any> {
    const primaryModel = this.models[0];
    const fallbackModel = this.models[1];

    console.log(`[${options.correlationId}] Routing LLM request to ${primaryModel.model}`);

    try {
      const response = await this.client.completion({
        model: primaryModel.model,
        messages,
        temperature: 0.1,
        max_tokens: 4096
      });

      // Track cost
      const cost = response.usage.total_tokens * primaryModel.costPerToken;
      this.trackCost(options.userId, cost);

      console.log(`[${options.correlationId}] LLM request completed, cost: $${cost.toFixed(4)}`);
      return response;
    } catch (error) {
      console.warn(`[${options.correlationId}] Primary model failed, trying fallback:`, error.message);

      try {
        const response = await this.client.completion({
          model: fallbackModel.model,
          messages,
          temperature: 0.1,
          max_tokens: 4096
        });

        const cost = response.usage.total_tokens * fallbackModel.costPerToken;
        this.trackCost(options.userId, cost);

        console.log(`[${options.correlationId}] Fallback completed, cost: $${cost.toFixed(4)}`);
        return response;
      } catch (fallbackError) {
        console.error(`[${options.correlationId}] Both models failed:`, fallbackError.message);
        throw new Error('All language models unavailable');
      }
    }
  }

  private trackCost(userId: string, cost: number) {
    const current = this.costTracking.get(userId) || 0;
    this.costTracking.set(userId, current + cost);
  }

  getUserCost(userId: string): number {
    return this.costTracking.get(userId) || 0;
  }
}

  constructor() {
    this.client = new LiteLLM();
    this.initializeModels();
    this.initializeRoutingRules();
    this.startHealthMonitoring();
  }

  private initializeModels() {
    const models: ModelConfig[] = [
      {
        model: 'gpt-4o',
        provider: 'openai',
        apiKey: process.env.OPENAI_API_KEY!,
        maxTokens: 4096,
        temperature: 0.1,
        costPerToken: 0.00003
      },
      {
        model: 'gpt-4o-mini',
        provider: 'openai',
        apiKey: process.env.OPENAI_API_KEY!,
        maxTokens: 4096,
        temperature: 0.1,
        costPerToken: 0.000015
      },
      {
        model: 'claude-3-5-sonnet-20241022',
        provider: 'anthropic',
        apiKey: process.env.ANTHROPIC_API_KEY!,
        maxTokens: 4096,
        temperature: 0.1,
        costPerToken: 0.000015
      },
      {
        model: 'claude-3-haiku-20240307',
        provider: 'anthropic',
        apiKey: process.env.ANTHROPIC_API_KEY!,
        maxTokens: 4096,
        temperature: 0.1,
        costPerToken: 0.00000025
      }
    ];

    models.forEach(config => {
      this.modelConfigs.set(config.model, config);
      this.healthStatus.set(config.model, true);
    });
  }

  private initializeRoutingRules() {
    const rules: RoutingRule[] = [
      {
        taskType: 'intent_understanding',
        primaryModel: 'gpt-4o',
        fallbackModels: ['claude-3-5-sonnet-20241022', 'gpt-4o-mini'],
        qualityThreshold: 0.95,
        maxLatency: 3000
      },
      {
        taskType: 'content_analysis',
        primaryModel: 'claude-3-5-sonnet-20241022',
        fallbackModels: ['gpt-4o', 'gpt-4o-mini'],
        qualityThreshold: 0.90,
        maxLatency: 5000
      },
      {
        taskType: 'simple_classification',
        primaryModel: 'gpt-4o-mini',
        fallbackModels: ['claude-3-haiku-20240307'],
        qualityThreshold: 0.85,
        maxLatency: 2000
      },
      {
        taskType: 'creative_generation',
        primaryModel: 'claude-3-5-sonnet-20241022',
        fallbackModels: ['gpt-4o'],
        qualityThreshold: 0.90,
        maxLatency: 10000
      }
    ];

    rules.forEach(rule => {
      this.routingRules.set(rule.taskType, rule);
    });
  }

  async routeRequest(
    taskType: string,
    messages: any[],
    options: {
      priority?: 'low' | 'medium' | 'high';
      maxCost?: number;
      requireStructuredOutput?: boolean;
    } = {}
  ): Promise<any> {
    const rule = this.routingRules.get(taskType);
    if (!rule) {
      throw new Error(`No routing rule found for task type: ${taskType}`);
    }

    const availableModels = [rule.primaryModel, ...rule.fallbackModels]
      .filter(model => this.healthStatus.get(model));

    if (availableModels.length === 0) {
      throw new Error(`No healthy models available for task type: ${taskType}`);
    }

    // Select model based on priority and constraints
    const selectedModel = this.selectOptimalModel(
      availableModels,
      options,
      rule
    );

    const startTime = Date.now();

    try {
      const response = await this.client.completion({
        model: selectedModel,
        messages,
        temperature: this.modelConfigs.get(selectedModel)?.temperature || 0.1,
        max_tokens: this.modelConfigs.get(selectedModel)?.maxTokens || 4096,
        ...options
      });

      const executionTime = Date.now() - startTime;

      // Record successful execution
      await this.recordModelUsage(selectedModel, executionTime, true, taskType);

      return response;
    } catch (error) {
      const executionTime = Date.now() - startTime;

      // Record failed execution
      await this.recordModelUsage(selectedModel, executionTime, false, taskType, error.message);

      // Try fallback models
      const fallbackModels = availableModels.slice(1);
      if (fallbackModels.length > 0) {
        console.warn(`Primary model ${selectedModel} failed, trying fallback`);
        return await this.tryFallbackModels(fallbackModels, messages, options, taskType);
      }

      throw error;
    }
  }

  private selectOptimalModel(
    availableModels: string[],
    options: any,
    rule: RoutingRule
  ): string {
    // Simple selection logic - could be enhanced with more sophisticated algorithms
    if (options.priority === 'high') {
      return availableModels[0]; // Use primary model for high priority
    }

    if (options.maxCost) {
      // Find cheapest model that meets requirements
      const sortedByCost = availableModels.sort((a, b) => {
        const costA = this.modelConfigs.get(a)?.costPerToken || 0;
        const costB = this.modelConfigs.get(b)?.costPerToken || 0;
        return costA - costB;
      });
      return sortedByCost[0];
    }

    return availableModels[0];
  }

  private async tryFallbackModels(
    models: string[],
    messages: any[],
    options: any,
    taskType: string
  ): Promise<any> {
    for (const model of models) {
      try {
        const response = await this.client.completion({
          model,
          messages,
          temperature: this.modelConfigs.get(model)?.temperature || 0.1,
          max_tokens: this.modelConfigs.get(model)?.maxTokens || 4096,
          ...options
        });

        await this.recordModelUsage(model, 0, true, taskType);
        return response;
      } catch (error) {
        console.warn(`Fallback model ${model} also failed:`, error.message);
        await this.recordModelUsage(model, 0, false, taskType, error.message);
      }
    }

    throw new Error('All fallback models failed');
  }

  private startHealthMonitoring() {
    setInterval(async () => {
      for (const [model, config] of this.modelConfigs) {
        try {
          const startTime = Date.now();
          await this.client.completion({
            model,
            messages: [{ role: 'user', content: 'Health check' }],
            max_tokens: 1
          });

          const responseTime = Date.now() - startTime;
          this.healthStatus.set(model, responseTime < 10000); // 10 second timeout
        } catch (error) {
          this.healthStatus.set(model, false);
          console.warn(`Model ${model} health check failed:`, error.message);
        }
      }
    }, 60000); // Check every minute
  }

  private async recordModelUsage(
    model: string,
    executionTime: number,
    success: boolean,
    taskType: string,
    error?: string
  ) {
    // This would integrate with your monitoring system
    console.log(`Model usage: ${model}, task: ${taskType}, time: ${executionTime}ms, success: ${success}`);
  }
}
```

### Week 4: Spatial Integration and Vertical Slice Completion

#### Basic Spatial Environment Generation

**Simple Spatial Environment Service:**
```typescript
// services/spatial/SimpleSpatialService.ts
import { RedisContextService } from '../context/RedisContextService';

interface SpatialItem {
  id: string;
  contentId: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  mediaUrl: string;
  contentType: string;
}

interface SpatialEnvironment {
  id: string;
  name: string;
  type: 'gallery' | 'timeline' | 'cluster';
  items: SpatialItem[];
  camera: {
    position: [number, number, number];
    target: [number, number, number];
  };
  createdAt: string;
}

export class SimpleSpatialService {
  constructor(
    private contextService: RedisContextService,
    private db: Database
  ) {}

  async createSpatialEnvironment(
    name: string,
    type: 'gallery' | 'timeline' | 'cluster',
    contentItems: any[],
    userId: string,
    tenantId: string,
    correlationId: string
  ): Promise<SpatialEnvironment> {
    console.log(`[${correlationId}] Creating spatial environment:`, { name, type, itemCount: contentItems.length });

    const environmentId = `spatial_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const spatialItems = this.arrangeSpatialItems(contentItems, type);

    const environment: SpatialEnvironment = {
      id: environmentId,
      name,
      type,
      items: spatialItems,
      camera: this.getDefaultCamera(type),
      createdAt: new Date().toISOString()
    };

    // Store in database
    await this.db.query(`
      INSERT INTO spatial_environments (id, user_id, tenant_id, name, type, environment_data, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
    `, [environmentId, userId, tenantId, name, type, JSON.stringify(environment)]);

    console.log(`[${correlationId}] Spatial environment created:`, environmentId);
    return environment;
  }

  private arrangeSpatialItems(contentItems: any[], type: string): SpatialItem[] {
    return contentItems.map((item, index) => {
      let position: [number, number, number];

      switch (type) {
        case 'gallery':
          // Arrange in a grid on walls
          const wall = Math.floor(index / 5);
          const posOnWall = index % 5;
          position = this.getGalleryPosition(wall, posOnWall);
          break;
        case 'timeline':
          // Arrange in a line
          position = [(index - contentItems.length / 2) * 3, 0, 0];
          break;
        case 'cluster':
          // Arrange in a circle
          const angle = (index / contentItems.length) * Math.PI * 2;
          position = [Math.cos(angle) * 5, 0, Math.sin(angle) * 5];
          break;
        default:
          position = [0, 0, 0];
      }

      return {
        id: `spatial_${item.id}`,
        contentId: item.id,
        position,
        rotation: [0, 0, 0],
        scale: [1, 1, 0.1],
        mediaUrl: item.url || item.media_url,
        contentType: item.content_type || 'image'
      };
    });
  }

  private getGalleryPosition(wall: number, position: number): [number, number, number] {
    const spacing = 2;
    const wallDistance = 5;

    switch (wall) {
      case 0: return [(position - 2) * spacing, 1, -wallDistance]; // Front
      case 1: return [wallDistance, 1, (position - 2) * spacing]; // Right
      case 2: return [(2 - position) * spacing, 1, wallDistance]; // Back
      default: return [-wallDistance, 1, (2 - position) * spacing]; // Left
    }
  }

  private getDefaultCamera(type: string) {
    switch (type) {
      case 'gallery':
        return { position: [0, 2, 8], target: [0, 1, 0] };
      case 'timeline':
        return { position: [0, 5, 10], target: [0, 0, 0] };
      default:
        return { position: [0, 3, 6], target: [0, 0, 0] };
    }
  }

  async getSpatialEnvironment(environmentId: string): Promise<SpatialEnvironment | null> {
    const result = await this.db.query(`
      SELECT environment_data FROM spatial_environments WHERE id = $1
    `, [environmentId]);

    return result.rows.length > 0 ? JSON.parse(result.rows[0].environment_data) : null;
  }
}

#### Simple Agent with Tool Chaining

**Basic Agent Service:**
```typescript
// services/agent/SimpleAgentService.ts
import { SimpleLLMService } from '../model-routing/SimpleLLMService';
import { RedisContextService } from '../context/RedisContextService';
import { CoreTools } from '../tools/CoreTools';
import { SimpleSpatialService } from '../spatial/SimpleSpatialService';

export class SimpleAgentService {
  constructor(
    private llmService: SimpleLLMService,
    private contextService: RedisContextService,
    private coreTools: CoreTools,
    private spatialService: SimpleSpatialService
  ) {}

  async processRequest(
    userMessage: string,
    userId: string,
    tenantId: string
  ): Promise<{ response: string; actions: any[] }> {
    const correlationId = this.contextService.generateCorrelationId();
    console.log(`[${correlationId}] Processing user request:`, userMessage);

    const context = await this.contextService.getUserContext(userId, tenantId);
    const systemPrompt = this.buildSystemPrompt(context);

    const response = await this.llmService.routeRequest(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      { correlationId, userId, tenantId }
    );

    const assistantMessage = response.choices[0].message.content;

    // Parse for tool calls or spatial requests
    const actions = await this.executeToolChain(assistantMessage, userId, tenantId, correlationId);

    return {
      response: assistantMessage,
      actions
    };
  }

  private async executeToolChain(
    message: string,
    userId: string,
    tenantId: string,
    correlationId: string
  ): Promise<any[]> {
    const actions = [];

    // Simple pattern matching for common workflows
    if (message.includes('search') || message.includes('find')) {
      const searchQuery = this.extractSearchQuery(message);
      if (searchQuery) {
        const results = await this.coreTools.searchUnifiedTool.execute(
          { query: searchQuery },
          { userId, tenantId }
        );
        actions.push({ type: 'search', results });
      }
    }

    if (message.includes('gallery') || message.includes('spatial') || message.includes('3D')) {
      // If we have search results, create spatial environment
      const searchAction = actions.find(a => a.type === 'search');
      if (searchAction && searchAction.results.length > 0) {
        const environment = await this.spatialService.createSpatialEnvironment(
          'Generated Gallery',
          'gallery',
          searchAction.results.slice(0, 20),
          userId,
          tenantId,
          correlationId
        );
        actions.push({ type: 'spatial_environment', environment });
      }
    }

    return actions;
  }

  private extractSearchQuery(message: string): string | null {
    // Simple extraction - could be enhanced with better NLP
    const patterns = [
      /search for ([^.!?]+)/i,
      /find ([^.!?]+)/i,
      /show me ([^.!?]+)/i
    ];

    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    return null;
  }

  private buildSystemPrompt(context: any): string {
    return `You are a creative assistant that helps users work with multimedia content.

Available capabilities:
- Search for images, videos, audio, and text content
- Create canvas collections to organize content
- Generate 3D spatial environments (galleries, timelines, clusters)
- Pin content to canvases for organization

User context:
- Recent searches: ${context?.recentSearches?.slice(0, 3).join(', ') || 'none'}
- Active projects: ${context?.activeProjects?.length || 0}

When users ask for spatial environments, galleries, or 3D views, search for relevant content first, then create the spatial arrangement.

Respond conversationally and execute the requested actions.`;
  }
}

  private buildSystemPrompt(context: UserContext): string {
    return `You are an expert creative workflow analyst. Your job is to understand user intent and generate detailed workflow definitions for a multimedia creative platform.

Current User Context:
- Active Projects: ${context.activeProjects.map(p => p.name).join(', ')}
- Recent Searches: ${context.recentSearches.slice(0, 5).join(', ')}
- Canvas Items: ${context.canvasItems.length} items currently pinned
- Preferred Quality Level: ${context.preferences.qualityLevel}
- Available Tools: ${context.availableTools.join(', ')}

Platform Capabilities:
- Content Search: Find images, videos, audio, text across large multimedia database
- Content Generation: Create images, videos, audio using AI models
- Spatial Layouts: Arrange content in 2D/3D spatial environments
- Canvas Management: Pin, arrange, and organize content collections
- Project Management: Create, organize, and manage creative projects
- Quality Control: Automated and human-reviewed quality assessment

Workflow Types Available:
- create_video_project: Multi-step video creation with content search and arrangement
- create_image_gallery: Curated image collection with spatial layout
- generate_multimedia_content: AI-powered content generation workflow
- analyze_and_organize: Content analysis and intelligent organization
- spatial_environment_creation: 3D environment design and population
- collaborative_editing: Multi-user creative collaboration workflow

You must respond with a valid JSON object matching this schema:
{
  "workflowType": "string (one of the available workflow types)",
  "intent": "string (clear description of what user wants to accomplish)",
  "confidence": "number (0-1, how confident you are in this interpretation)",
  "parameters": "object (key-value pairs of workflow parameters)",
  "steps": "array of step objects with id, type, description, dependencies, parameters, parallel, optional",
  "estimatedDuration": "number (estimated minutes to complete)",
  "estimatedCost": "number (estimated cost in credits/dollars)",
  "qualityRequirements": "object with technical, creative, relevance scores 0-1"
}

Consider the user's context and preferences when generating workflows. If the request is ambiguous, make reasonable assumptions based on context.`;
  }

  private buildUserPrompt(userMessage: string, context: UserContext): string {
    return `User Request: "${userMessage}"

Please analyze this request and generate a detailed workflow definition. Consider:
1. What is the user trying to create or accomplish?
2. What content or assets will they need?
3. What steps are required to achieve their goal?
4. How can we leverage their existing context (current projects, canvas items, etc.)?
5. What quality level do they expect based on their preferences?

Generate a comprehensive workflow definition that will guide the system in executing their request.`;
  }

  private async storeIntentClassification(
    userMessage: string,
    classification: WorkflowDefinition,
    userId: string,
    tenantId: string
  ) {
    await this.db.query(`
      INSERT INTO intent_classifications
      (user_id, tenant_id, user_message, classification, confidence, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
    `, [
      userId,
      tenantId,
      userMessage,
      JSON.stringify(classification),
      classification.confidence
    ]);
  }
}
```

#### Context Management System

**Context Service Implementation:**
```typescript
// services/context/ContextService.ts
interface UserContext {
  userId: string;
  tenantId: string;
  activeProjects: Project[];
  recentSearches: string[];
  canvasItems: CanvasItem[];
  spatialArrangements: SpatialLayout[];
  preferences: UserPreferences;
  sessionHistory: SessionEvent[];
  availableTools: string[];
  currentWorkflows: WorkflowExecution[];
}

interface UserPreferences {
  qualityLevel: 'draft' | 'standard' | 'high' | 'premium';
  preferredStyles: string[];
  defaultProjectSettings: Record<string, any>;
  notificationSettings: Record<string, boolean>;
  workflowTemplates: string[];
}

interface SessionEvent {
  timestamp: Date;
  eventType: string;
  data: Record<string, any>;
  workflowId?: string;
}

export class ContextService {
  private contextCache: Map<string, UserContext> = new Map();
  private readonly CACHE_TTL = 30 * 60 * 1000; // 30 minutes

  constructor(
    private db: Database,
    private redis: Redis
  ) {}

  async getUserContext(userId: string, tenantId: string): Promise<UserContext> {
    const cacheKey = `${tenantId}:${userId}`;

    // Check cache first
    if (this.contextCache.has(cacheKey)) {
      const cached = this.contextCache.get(cacheKey)!;
      if (Date.now() - cached.lastUpdated < this.CACHE_TTL) {
        return cached;
      }
    }

    // Build context from database
    const context = await this.buildUserContext(userId, tenantId);

    // Cache the context
    this.contextCache.set(cacheKey, context);

    return context;
  }

  private async buildUserContext(userId: string, tenantId: string): Promise<UserContext> {
    // Get active projects
    const activeProjects = await this.db.query(`
      SELECT * FROM projects
      WHERE user_id = $1 AND tenant_id = $2 AND status = 'active'
      ORDER BY updated_at DESC
      LIMIT 10
    `, [userId, tenantId]);

    // Get recent searches
    const recentSearches = await this.db.query(`
      SELECT query FROM search_history
      WHERE user_id = $1 AND tenant_id = $2
      ORDER BY created_at DESC
      LIMIT 20
    `, [userId, tenantId]);

    // Get canvas items
    const canvasItems = await this.db.query(`
      SELECT c.*, ci.* FROM canvases c
      JOIN canvas_items ci ON c.id = ci.canvas_id
      WHERE c.user_id = $1 AND c.tenant_id = $2 AND c.status = 'active'
      ORDER BY ci.updated_at DESC
    `, [userId, tenantId]);

    // Get user preferences
    const preferences = await this.db.query(`
      SELECT preferences FROM user_preferences
      WHERE user_id = $1 AND tenant_id = $2
    `, [userId, tenantId]);

    // Get session history
    const sessionHistory = await this.db.query(`
      SELECT * FROM session_events
      WHERE user_id = $1 AND tenant_id = $2
      AND created_at > NOW() - INTERVAL '24 hours'
      ORDER BY created_at DESC
      LIMIT 100
    `, [userId, tenantId]);

    // Get current workflows
    const currentWorkflows = await this.db.query(`
      SELECT * FROM workflow_executions
      WHERE user_id = $1 AND tenant_id = $2 AND status IN ('running', 'paused')
      ORDER BY created_at DESC
    `, [userId, tenantId]);

    return {
      userId,
      tenantId,
      activeProjects: activeProjects.rows,
      recentSearches: recentSearches.rows.map(r => r.query),
      canvasItems: canvasItems.rows,
      spatialArrangements: [], // Would be populated from spatial layout service
      preferences: preferences.rows[0]?.preferences || this.getDefaultPreferences(),
      sessionHistory: sessionHistory.rows,
      availableTools: await this.getAvailableTools(userId, tenantId),
      currentWorkflows: currentWorkflows.rows,
      lastUpdated: Date.now()
    };
  }

  async updateContext(
    userId: string,
    tenantId: string,
    updates: Partial<UserContext>
  ) {
    const cacheKey = `${tenantId}:${userId}`;
    const currentContext = await this.getUserContext(userId, tenantId);

    const updatedContext = {
      ...currentContext,
      ...updates,
      lastUpdated: Date.now()
    };

    this.contextCache.set(cacheKey, updatedContext);

    // Persist important updates to database
    if (updates.preferences) {
      await this.db.query(`
        INSERT INTO user_preferences (user_id, tenant_id, preferences, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (user_id, tenant_id) DO UPDATE SET
          preferences = $3, updated_at = NOW()
      `, [userId, tenantId, JSON.stringify(updates.preferences)]);
    }
  }

  async recordSessionEvent(
    userId: string,
    tenantId: string,
    eventType: string,
    data: Record<string, any>,
    workflowId?: string
  ) {
    const event: SessionEvent = {
      timestamp: new Date(),
      eventType,
      data,
      workflowId
    };

    // Add to context
    const context = await this.getUserContext(userId, tenantId);
    context.sessionHistory.unshift(event);

    // Keep only recent events in memory
    context.sessionHistory = context.sessionHistory.slice(0, 100);

    this.contextCache.set(`${tenantId}:${userId}`, context);

    // Persist to database
    await this.db.query(`
      INSERT INTO session_events
      (user_id, tenant_id, event_type, event_data, workflow_id, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
    `, [userId, tenantId, eventType, JSON.stringify(data), workflowId]);
  }

  private getDefaultPreferences(): UserPreferences {
    return {
      qualityLevel: 'standard',
      preferredStyles: [],
      defaultProjectSettings: {},
      notificationSettings: {
        workflowComplete: true,
        qualityIssues: true,
        collaborationUpdates: true
      },
      workflowTemplates: []
    };
  }

  private async getAvailableTools(userId: string, tenantId: string): Promise<string[]> {
    // This would integrate with the tool registry
    return [
      'searchUnified',
      'createCanvas',
      'generateContent',
      'analyzeContent',
      'createProject',
      'uploadMedia',
      'createLayout',
      'exportContent'
    ];
  }
}
```

### Week 5: Comprehensive Tool Coverage

#### Composite Workflow Tools

**High-Level Workflow Tools Implementation:**
```typescript
// services/tools/CompositeWorkflowTools.ts
import { tool } from 'ai';
import { z } from 'zod';

export class CompositeWorkflowTools {
  constructor(
    private orchestrator: WorkflowOrchestrator,
    private toolRegistry: ToolRegistry,
    private contextService: ContextService
  ) {}

  createVideoProjectTool = tool({
    description: 'Create a complete video project with content search, analysis, and spatial arrangement',
    parameters: z.object({
      projectName: z.string().describe('Name for the video project'),
      theme: z.string().describe('Theme or style for the video (e.g., "cyberpunk", "nature", "corporate")'),
      duration: z.number().optional().describe('Target duration in seconds'),
      audioPreference: z.enum(['music', 'ambient', 'voiceover', 'none']).optional(),
      visualStyle: z.enum(['cinematic', 'documentary', 'artistic', 'commercial']).optional(),
      qualityLevel: z.enum(['draft', 'standard', 'high', 'premium']).optional()
    }),
    execute: async (params, context) => {
      const workflowDefinition = {
        workflowType: 'create_video_project',
        steps: [
          {
            id: 'create_project',
            type: 'project_management',
            tool: 'createProject',
            parameters: {
              name: params.projectName,
              type: 'video',
              metadata: {
                theme: params.theme,
                duration: params.duration,
                visualStyle: params.visualStyle
              }
            }
          },
          {
            id: 'search_video_content',
            type: 'content_search',
            tool: 'searchUnified',
            parameters: {
              query: `${params.theme} video footage`,
              mediaType: 'video',
              limit: 20
            },
            dependencies: ['create_project']
          },
          {
            id: 'search_audio_content',
            type: 'content_search',
            tool: 'searchUnified',
            parameters: {
              query: `${params.theme} ${params.audioPreference || 'music'}`,
              mediaType: 'audio',
              limit: 10
            },
            dependencies: ['create_project'],
            parallel: true
          },
          {
            id: 'analyze_content',
            type: 'content_analysis',
            tool: 'analyzeMediaCollection',
            parameters: {
              analysisType: 'compatibility',
              includeAesthetic: true,
              includeTechnical: true
            },
            dependencies: ['search_video_content', 'search_audio_content']
          },
          {
            id: 'create_spatial_layout',
            type: 'spatial_arrangement',
            tool: 'createTimelineLayout',
            parameters: {
              layoutType: 'video_timeline',
              duration: params.duration,
              qualityLevel: params.qualityLevel || 'standard'
            },
            dependencies: ['analyze_content']
          },
          {
            id: 'generate_preview',
            type: 'content_generation',
            tool: 'generateVideoPreview',
            parameters: {
              previewDuration: 30,
              includeAudio: true
            },
            dependencies: ['create_spatial_layout']
          }
        ]
      };

      const executionId = await this.orchestrator.executeWorkflow(
        'create_video_project',
        workflowDefinition,
        context.tenantId,
        context.userId
      );

      return {
        success: true,
        executionId,
        message: `Started video project creation: ${params.projectName}`,
        estimatedCompletion: '5-10 minutes'
      };
    }
  });

  publishToSpatialEnvironmentTool = tool({
    description: 'Publish content to a 3D spatial environment with interactive navigation',
    parameters: z.object({
      contentSource: z.enum(['canvas', 'project', 'search_results']).describe('Source of content to publish'),
      environmentType: z.enum(['gallery', 'timeline', 'cluster', 'custom']).describe('Type of spatial arrangement'),
      interactionLevel: z.enum(['view_only', 'navigable', 'interactive']).describe('Level of user interaction'),
      title: z.string().describe('Title for the spatial environment'),
      description: z.string().optional().describe('Description of the environment')
    }),
    execute: async (params, context) => {
      const workflowDefinition = {
        workflowType: 'publish_spatial_environment',
        steps: [
          {
            id: 'gather_content',
            type: 'content_collection',
            tool: 'gatherContentFromSource',
            parameters: {
              source: params.contentSource,
              includeMetadata: true
            }
          },
          {
            id: 'analyze_spatial_requirements',
            type: 'spatial_analysis',
            tool: 'analyzeSpatialRequirements',
            parameters: {
              contentCount: 'dynamic',
              environmentType: params.environmentType,
              interactionLevel: params.interactionLevel
            },
            dependencies: ['gather_content']
          },
          {
            id: 'create_3d_layout',
            type: 'spatial_layout',
            tool: 'create3DLayout',
            parameters: {
              layoutType: params.environmentType,
              optimizeForNavigation: params.interactionLevel !== 'view_only'
            },
            dependencies: ['analyze_spatial_requirements']
          },
          {
            id: 'generate_navigation_system',
            type: 'interaction_system',
            tool: 'generateNavigationSystem',
            parameters: {
              interactionLevel: params.interactionLevel,
              includeSearch: true,
              includeFiltering: true
            },
            dependencies: ['create_3d_layout']
          },
          {
            id: 'render_environment',
            type: 'spatial_rendering',
            tool: 'renderSpatialEnvironment',
            parameters: {
              quality: 'high',
              enableRealTimeUpdates: true
            },
            dependencies: ['generate_navigation_system']
          }
        ]
      };

      const executionId = await this.orchestrator.executeWorkflow(
        'publish_spatial_environment',
        workflowDefinition,
        context.tenantId,
        context.userId
      );

      return {
        success: true,
        executionId,
        message: `Publishing spatial environment: ${params.title}`,
        previewUrl: `/spatial-preview/${executionId}`,
        estimatedCompletion: '3-7 minutes'
      };
    }
  });

  createMultimediaStoryTool = tool({
    description: 'Create an interactive multimedia story with narrative flow and spatial presentation',
    parameters: z.object({
      storyTitle: z.string().describe('Title of the story'),
      narrative: z.string().describe('Brief description of the narrative or theme'),
      mediaTypes: z.array(z.enum(['image', 'video', 'audio', 'text'])).describe('Types of media to include'),
      presentationStyle: z.enum(['linear', 'branching', 'exploratory']).describe('How users navigate the story'),
      targetAudience: z.enum(['general', 'professional', 'artistic', 'educational']).describe('Target audience'),
      estimatedLength: z.enum(['short', 'medium', 'long']).describe('Estimated story length')
    }),
    execute: async (params, context) => {
      const workflowDefinition = {
        workflowType: 'create_multimedia_story',
        steps: [
          {
            id: 'analyze_narrative',
            type: 'content_analysis',
            tool: 'analyzeNarrativeStructure',
            parameters: {
              narrative: params.narrative,
              targetAudience: params.targetAudience,
              presentationStyle: params.presentationStyle
            }
          },
          {
            id: 'search_supporting_media',
            type: 'content_search',
            tool: 'searchMultipleMediaTypes',
            parameters: {
              query: params.narrative,
              mediaTypes: params.mediaTypes,
              diversityLevel: 'high'
            },
            dependencies: ['analyze_narrative']
          },
          {
            id: 'generate_story_structure',
            type: 'narrative_design',
            tool: 'generateStoryStructure',
            parameters: {
              presentationStyle: params.presentationStyle,
              estimatedLength: params.estimatedLength,
              includeInteractiveElements: params.presentationStyle !== 'linear'
            },
            dependencies: ['analyze_narrative', 'search_supporting_media']
          },
          {
            id: 'create_spatial_narrative',
            type: 'spatial_storytelling',
            tool: 'createSpatialNarrative',
            parameters: {
              storyStructure: 'dynamic',
              enableNavigation: true,
              includeTransitions: true
            },
            dependencies: ['generate_story_structure']
          },
          {
            id: 'generate_interactive_elements',
            type: 'interaction_design',
            tool: 'generateInteractiveElements',
            parameters: {
              interactionTypes: ['click', 'hover', 'scroll'],
              includeProgressTracking: true
            },
            dependencies: ['create_spatial_narrative']
          }
        ]
      };

      const executionId = await this.orchestrator.executeWorkflow(
        'create_multimedia_story',
        workflowDefinition,
        context.tenantId,
        context.userId
      );

      return {
        success: true,
        executionId,
        message: `Creating multimedia story: ${params.storyTitle}`,
        storyUrl: `/story/${executionId}`,
        estimatedCompletion: '10-15 minutes'
      };
    }
  });

  getAllCompositeTools() {
    return {
      createVideoProject: this.createVideoProjectTool,
      publishToSpatialEnvironment: this.publishToSpatialEnvironmentTool,
      createMultimediaStory: this.createMultimediaStoryTool
    };
  }
}
```

#### UI Action Tools

**UI Control Tools Implementation:**
```typescript
// services/tools/UIActionTools.ts
export class UIActionTools {
  constructor(
    private contextService: ContextService
  ) {}

  navigateToPageTool = tool({
    description: 'Navigate to different pages within the application',
    parameters: z.object({
      page: z.enum([
        'workshop', 'library', 'file-manager', 'video-analysis',
        'audio-labeling', 'timeline', 'manage', 'upload', 'spatial-preview'
      ]).describe('Target page to navigate to'),
      params: z.record(z.string()).optional().describe('URL parameters for the page')
    }),
    execute: async (params, context) => {
      await this.contextService.recordSessionEvent(
        context.userId,
        context.tenantId,
        'navigation',
        { page: params.page, params: params.params }
      );

      return {
        action: 'navigate',
        page: params.page,
        params: params.params || {},
        message: `Navigating to ${params.page}`
      };
    }
  });

  openModalTool = tool({
    description: 'Open modal dialogs for various functions',
    parameters: z.object({
      modalType: z.enum([
        'canvas', 'project_settings', 'upload', 'export', 'quality_review',
        'collaboration', 'spatial_settings', 'workflow_status'
      ]).describe('Type of modal to open'),
      data: z.record(z.any()).optional().describe('Data to pass to the modal')
    }),
    execute: async (params, context) => {
      return {
        action: 'openModal',
        modalType: params.modalType,
        data: params.data || {},
        message: `Opening ${params.modalType} modal`
      };
    }
  });

  changeViewTool = tool({
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
    execute: async (params, context) => {
      await this.contextService.recordSessionEvent(
        context.userId,
        context.tenantId,
        'view_change',
        { viewType: params.viewType, options: params.options }
      );

      return {
        action: 'changeView',
        viewType: params.viewType,
        options: params.options || {},
        message: `Switched to ${params.viewType} view`
      };
    }
  });

  selectContentTool = tool({
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
    execute: async (params, context) => {
      let selectedItems: string[] = [];

      if (params.itemIds) {
        selectedItems = params.itemIds;
      } else if (params.criteria) {
        // This would query the current view's items based on criteria
        selectedItems = await this.getItemsByCriteria(params.criteria, context);
      }

      await this.contextService.recordSessionEvent(
        context.userId,
        context.tenantId,
        'content_selection',
        { action: params.action, itemIds: selectedItems }
      );

      return {
        action: 'selectContent',
        selectionAction: params.action,
        selectedItems,
        message: `${params.action} applied to ${selectedItems.length} items`
      };
    }
  });

  manageSpatialEnvironmentTool = tool({
    description: 'Control spatial environment settings and navigation',
    parameters: z.object({
      action: z.enum([
        'enter_spatial_mode', 'exit_spatial_mode', 'change_camera_angle',
        'adjust_lighting', 'toggle_grid', 'reset_view', 'save_viewpoint'
      ]).describe('Spatial environment action'),
      parameters: z.record(z.any()).optional().describe('Action-specific parameters')
    }),
    execute: async (params, context) => {
      await this.contextService.recordSessionEvent(
        context.userId,
        context.tenantId,
        'spatial_control',
        { action: params.action, parameters: params.parameters }
      );

      return {
        action: 'spatialControl',
        spatialAction: params.action,
        parameters: params.parameters || {},
        message: `Spatial environment: ${params.action}`
      };
    }
  });

  manageWorkflowTool = tool({
    description: 'Control running workflows - pause, resume, cancel, or modify',
    parameters: z.object({
      workflowId: z.string().describe('ID of the workflow to manage'),
      action: z.enum([
        'pause', 'resume', 'cancel', 'modify', 'get_status', 'get_results'
      ]).describe('Workflow management action'),
      modifications: z.record(z.any()).optional().describe('Modifications to apply if action is modify')
    }),
    execute: async (params, context) => {
      // This would integrate with the workflow orchestrator
      const result = await this.handleWorkflowAction(
        params.workflowId,
        params.action,
        params.modifications,
        context
      );

      return {
        action: 'workflowControl',
        workflowId: params.workflowId,
        workflowAction: params.action,
        result,
        message: `Workflow ${params.action}: ${params.workflowId}`
      };
    }
  });

  private async getItemsByCriteria(criteria: any, context: any): Promise<string[]> {
    // This would query the current context to find items matching criteria
    // Implementation would depend on the current view and available data
    return [];
  }

  private async handleWorkflowAction(
    workflowId: string,
    action: string,
    modifications: any,
    context: any
  ): Promise<any> {
    // This would integrate with the WorkflowOrchestrator
    // Implementation depends on the orchestrator's API
    return { success: true };
  }

  getAllUIActionTools() {
    return {
      navigateToPage: this.navigateToPageTool,
      openModal: this.openModalTool,
      changeView: this.changeViewTool,
      selectContent: this.selectContentTool,
      manageSpatialEnvironment: this.manageSpatialEnvironmentTool,
      manageWorkflow: this.manageWorkflowTool
    };
  }
}
```

### Week 6: Agent-Frontend Integration

#### Real-time Communication

**WebSocket Communication Service:**
```typescript
// services/communication/WebSocketService.ts
import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';

interface ClientConnection {
  ws: WebSocket;
  userId: string;
  tenantId: string;
  sessionId: string;
  subscriptions: Set<string>;
}

interface Message {
  type: string;
  payload: any;
  timestamp: number;
  messageId: string;
}

export class WebSocketService {
  private wss: WebSocketServer;
  private clients: Map<string, ClientConnection> = new Map();
  private subscriptions: Map<string, Set<string>> = new Map();

  constructor(private server: any) {
    this.wss = new WebSocketServer({ server });
    this.setupWebSocketServer();
  }

  private setupWebSocketServer() {
    this.wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
      const url = new URL(request.url!, `http://${request.headers.host}`);
      const userId = url.searchParams.get('userId');
      const tenantId = url.searchParams.get('tenantId');
      const sessionId = url.searchParams.get('sessionId');

      if (!userId || !tenantId || !sessionId) {
        ws.close(1008, 'Missing required parameters');
        return;
      }

      const clientId = `${tenantId}:${userId}:${sessionId}`;
      const client: ClientConnection = {
        ws,
        userId,
        tenantId,
        sessionId,
        subscriptions: new Set()
      };

      this.clients.set(clientId, client);

      ws.on('message', (data: Buffer) => {
        try {
          const message: Message = JSON.parse(data.toString());
          this.handleClientMessage(clientId, message);
        } catch (error) {
          console.error('Invalid message format:', error);
        }
      });

      ws.on('close', () => {
        this.handleClientDisconnect(clientId);
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.handleClientDisconnect(clientId);
      });

      // Send connection confirmation
      this.sendToClient(clientId, {
        type: 'connection_established',
        payload: { clientId, timestamp: Date.now() },
        timestamp: Date.now(),
        messageId: this.generateMessageId()
      });
    });
  }

  private handleClientMessage(clientId: string, message: Message) {
    const client = this.clients.get(clientId);
    if (!client) return;

    switch (message.type) {
      case 'subscribe':
        this.handleSubscription(clientId, message.payload.channels);
        break;
      case 'unsubscribe':
        this.handleUnsubscription(clientId, message.payload.channels);
        break;
      case 'workflow_command':
        this.handleWorkflowCommand(clientId, message.payload);
        break;
      case 'spatial_interaction':
        this.handleSpatialInteraction(clientId, message.payload);
        break;
      case 'ping':
        this.sendToClient(clientId, {
          type: 'pong',
          payload: {},
          timestamp: Date.now(),
          messageId: this.generateMessageId()
        });
        break;
    }
  }

  private handleSubscription(clientId: string, channels: string[]) {
    const client = this.clients.get(clientId);
    if (!client) return;

    channels.forEach(channel => {
      client.subscriptions.add(channel);

      if (!this.subscriptions.has(channel)) {
        this.subscriptions.set(channel, new Set());
      }
      this.subscriptions.get(channel)!.add(clientId);
    });

    this.sendToClient(clientId, {
      type: 'subscription_confirmed',
      payload: { channels },
      timestamp: Date.now(),
      messageId: this.generateMessageId()
    });
  }

  private handleUnsubscription(clientId: string, channels: string[]) {
    const client = this.clients.get(clientId);
    if (!client) return;

    channels.forEach(channel => {
      client.subscriptions.delete(channel);
      this.subscriptions.get(channel)?.delete(clientId);
    });
  }

  private handleWorkflowCommand(clientId: string, payload: any) {
    // Forward workflow commands to the orchestration service
    // This would integrate with your WorkflowOrchestrator
    console.log('Workflow command from client:', clientId, payload);
  }

  private handleSpatialInteraction(clientId: string, payload: any) {
    // Handle spatial environment interactions
    // Broadcast to other clients in the same spatial environment if needed
    const spatialChannel = `spatial:${payload.environmentId}`;
    this.broadcastToChannel(spatialChannel, {
      type: 'spatial_update',
      payload: {
        userId: this.clients.get(clientId)?.userId,
        interaction: payload
      },
      timestamp: Date.now(),
      messageId: this.generateMessageId()
    }, [clientId]); // Exclude sender
  }

  private handleClientDisconnect(clientId: string) {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Remove from all subscriptions
    client.subscriptions.forEach(channel => {
      this.subscriptions.get(channel)?.delete(clientId);
    });

    this.clients.delete(clientId);
  }

  // Public methods for sending messages

  sendToClient(clientId: string, message: Message) {
    const client = this.clients.get(clientId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  }

  sendToUser(userId: string, tenantId: string, message: Message) {
    const userClients = Array.from(this.clients.entries())
      .filter(([_, client]) => client.userId === userId && client.tenantId === tenantId);

    userClients.forEach(([clientId, _]) => {
      this.sendToClient(clientId, message);
    });
  }

  broadcastToChannel(channel: string, message: Message, excludeClients: string[] = []) {
    const subscribers = this.subscriptions.get(channel);
    if (!subscribers) return;

    subscribers.forEach(clientId => {
      if (!excludeClients.includes(clientId)) {
        this.sendToClient(clientId, message);
      }
    });
  }

  // Workflow status updates
  sendWorkflowUpdate(userId: string, tenantId: string, workflowId: string, update: any) {
    this.sendToUser(userId, tenantId, {
      type: 'workflow_update',
      payload: {
        workflowId,
        update
      },
      timestamp: Date.now(),
      messageId: this.generateMessageId()
    });
  }

  // Spatial environment updates
  sendSpatialUpdate(environmentId: string, update: any) {
    this.broadcastToChannel(`spatial:${environmentId}`, {
      type: 'spatial_environment_update',
      payload: update,
      timestamp: Date.now(),
      messageId: this.generateMessageId()
    });
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
```

#### Spatial Context Integration

**Spatial Context Service:**
```typescript
// services/spatial/SpatialContextService.ts
interface SpatialEnvironment {
  id: string;
  name: string;
  type: 'gallery' | 'timeline' | 'cluster' | 'custom';
  layout: SpatialLayout;
  items: SpatialItem[];
  camera: CameraState;
  lighting: LightingConfig;
  interactions: InteractionConfig;
  metadata: Record<string, any>;
}

interface SpatialItem {
  id: string;
  contentId: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  properties: Record<string, any>;
}

interface CameraState {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  near: number;
  far: number;
}

export class SpatialContextService {
  constructor(
    private db: Database,
    private webSocketService: WebSocketService,
    private contextService: ContextService
  ) {}

  async createSpatialEnvironment(
    userId: string,
    tenantId: string,
    config: {
      name: string;
      type: string;
      sourceLayoutId?: string;
      sourceCanvasId?: string;
      contentIds?: string[];
    }
  ): Promise<SpatialEnvironment> {
    const environmentId = crypto.randomUUID();

    let items: SpatialItem[] = [];

    if (config.sourceLayoutId) {
      items = await this.convertLayoutToSpatialItems(config.sourceLayoutId);
    } else if (config.sourceCanvasId) {
      items = await this.convertCanvasToSpatialItems(config.sourceCanvasId);
    } else if (config.contentIds) {
      items = await this.createSpatialItemsFromContent(config.contentIds);
    }

    const environment: SpatialEnvironment = {
      id: environmentId,
      name: config.name,
      type: config.type as any,
      layout: this.generateSpatialLayout(config.type, items.length),
      items: this.arrangeSpatialItems(items, config.type),
      camera: this.getDefaultCameraState(config.type),
      lighting: this.getDefaultLighting(config.type),
      interactions: this.getDefaultInteractions(config.type),
      metadata: {
        createdBy: userId,
        tenantId,
        createdAt: new Date().toISOString()
      }
    };

    // Persist to database
    await this.db.query(`
      INSERT INTO spatial_environments
      (id, user_id, tenant_id, name, type, environment_data, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
    `, [
      environmentId, userId, tenantId, config.name,
      config.type, JSON.stringify(environment)
    ]);

    return environment;
  }

  async updateSpatialEnvironment(
    environmentId: string,
    updates: Partial<SpatialEnvironment>
  ): Promise<void> {
    const current = await this.getSpatialEnvironment(environmentId);
    if (!current) {
      throw new Error('Spatial environment not found');
    }

    const updated = { ...current, ...updates };

    await this.db.query(`
      UPDATE spatial_environments
      SET environment_data = $1, updated_at = NOW()
      WHERE id = $2
    `, [JSON.stringify(updated), environmentId]);

    // Broadcast update to connected clients
    this.webSocketService.sendSpatialUpdate(environmentId, {
      type: 'environment_updated',
      changes: updates
    });
  }

  async getSpatialEnvironment(environmentId: string): Promise<SpatialEnvironment | null> {
    const result = await this.db.query(`
      SELECT environment_data FROM spatial_environments WHERE id = $1
    `, [environmentId]);

    if (result.rows.length === 0) {
      return null;
    }

    return JSON.parse(result.rows[0].environment_data);
  }

  async handleSpatialInteraction(
    environmentId: string,
    userId: string,
    interaction: {
      type: 'move_item' | 'select_item' | 'camera_change' | 'lighting_change';
      data: any;
    }
  ): Promise<void> {
    const environment = await this.getSpatialEnvironment(environmentId);
    if (!environment) {
      throw new Error('Spatial environment not found');
    }

    let updates: Partial<SpatialEnvironment> = {};

    switch (interaction.type) {
      case 'move_item':
        const itemIndex = environment.items.findIndex(
          item => item.id === interaction.data.itemId
        );
        if (itemIndex >= 0) {
          environment.items[itemIndex].position = interaction.data.position;
          environment.items[itemIndex].rotation = interaction.data.rotation;
          environment.items[itemIndex].scale = interaction.data.scale;
          updates.items = environment.items;
        }
        break;

      case 'select_item':
        // Handle item selection - could update UI state
        break;

      case 'camera_change':
        updates.camera = {
          ...environment.camera,
          ...interaction.data
        };
        break;

      case 'lighting_change':
        updates.lighting = {
          ...environment.lighting,
          ...interaction.data
        };
        break;
    }

    if (Object.keys(updates).length > 0) {
      await this.updateSpatialEnvironment(environmentId, updates);
    }

    // Record interaction in context
    await this.contextService.recordSessionEvent(
      userId,
      environment.metadata.tenantId,
      'spatial_interaction',
      {
        environmentId,
        interactionType: interaction.type,
        data: interaction.data
      }
    );
  }

  private async convertLayoutToSpatialItems(layoutId: string): Promise<SpatialItem[]> {
    // Convert 2D layout coordinates to 3D spatial positions
    const layout = await this.getLayoutById(layoutId);

    return layout.items.map((item: any, index: number) => ({
      id: `spatial_${item.id}`,
      contentId: item.refId || item.id,
      position: [
        (item.nx - 0.5) * 10, // Convert normalized X to world coordinates
        (0.5 - item.ny) * 6,  // Convert normalized Y to world coordinates (flip Y)
        0                     // Z position for 2D layouts
      ],
      rotation: [0, 0, 0],
      scale: [
        item.nw * 2,          // Convert normalized width to world scale
        item.nh * 2,          // Convert normalized height to world scale
        0.1                   // Thin depth for 2D content
      ],
      properties: {
        originalLayoutPosition: { x: item.x, y: item.y, w: item.w, h: item.h },
        contentType: item.contentType,
        mediaUrl: item.mediaUrl
      }
    }));
  }

  private async convertCanvasToSpatialItems(canvasId: string): Promise<SpatialItem[]> {
    // Convert canvas items to spatial positions
    const canvas = await this.getCanvasById(canvasId);

    return canvas.items.map((item: any, index: number) => ({
      id: `spatial_${item.id}`,
      contentId: item.result.id,
      position: [
        (item.x - 500) / 100,  // Convert pixel coordinates to world coordinates
        (300 - item.y) / 100,  // Convert and flip Y coordinate
        0
      ],
      rotation: [0, 0, 0],
      scale: [
        item.width / 100,
        item.height / 100,
        0.1
      ],
      properties: {
        originalCanvasPosition: { x: item.x, y: item.y, width: item.width, height: item.height },
        contentType: item.result.content_type,
        mediaUrl: item.result.url
      }
    }));
  }

  private generateSpatialLayout(type: string, itemCount: number): SpatialLayout {
    // Generate appropriate spatial layout based on type and item count
    switch (type) {
      case 'gallery':
        return this.generateGalleryLayout(itemCount);
      case 'timeline':
        return this.generateTimelineLayout(itemCount);
      case 'cluster':
        return this.generateClusterLayout(itemCount);
      default:
        return this.generateCustomLayout(itemCount);
    }
  }

  private arrangeSpatialItems(items: SpatialItem[], type: string): SpatialItem[] {
    // Arrange items according to the spatial layout type
    switch (type) {
      case 'gallery':
        return this.arrangeInGallery(items);
      case 'timeline':
        return this.arrangeInTimeline(items);
      case 'cluster':
        return this.arrangeInClusters(items);
      default:
        return items; // Keep original positions
    }
  }

  private arrangeInGallery(items: SpatialItem[]): SpatialItem[] {
    // Arrange items in a gallery-style grid on walls
    const wallDistance = 5;
    const itemSpacing = 2;
    const itemsPerWall = Math.ceil(items.length / 4);

    return items.map((item, index) => {
      const wallIndex = Math.floor(index / itemsPerWall);
      const positionOnWall = index % itemsPerWall;

      let position: [number, number, number];
      let rotation: [number, number, number];

      switch (wallIndex) {
        case 0: // Front wall
          position = [
            (positionOnWall - itemsPerWall / 2) * itemSpacing,
            1,
            -wallDistance
          ];
          rotation = [0, 0, 0];
          break;
        case 1: // Right wall
          position = [
            wallDistance,
            1,
            (positionOnWall - itemsPerWall / 2) * itemSpacing
          ];
          rotation = [0, -Math.PI / 2, 0];
          break;
        case 2: // Back wall
          position = [
            (itemsPerWall / 2 - positionOnWall) * itemSpacing,
            1,
            wallDistance
          ];
          rotation = [0, Math.PI, 0];
          break;
        default: // Left wall
          position = [
            -wallDistance,
            1,
            (itemsPerWall / 2 - positionOnWall) * itemSpacing
          ];
          rotation = [0, Math.PI / 2, 0];
          break;
      }

      return {
        ...item,
        position,
        rotation
      };
    });
  }

  private arrangeInTimeline(items: SpatialItem[]): SpatialItem[] {
    // Arrange items along a timeline path
    const pathLength = items.length * 3;

    return items.map((item, index) => ({
      ...item,
      position: [
        (index - items.length / 2) * 3, // Spread along X axis
        0,
        0
      ],
      rotation: [0, 0, 0]
    }));
  }

  private arrangeInClusters(items: SpatialItem[]): SpatialItem[] {
    // Group items into clusters based on content type or other criteria
    const clusters = this.groupItemsIntoClusters(items);
    const clusterPositions = this.generateClusterPositions(clusters.length);

    let arrangedItems: SpatialItem[] = [];

    clusters.forEach((cluster, clusterIndex) => {
      const clusterCenter = clusterPositions[clusterIndex];

      cluster.forEach((item, itemIndex) => {
        const angle = (itemIndex / cluster.length) * Math.PI * 2;
        const radius = 2;

        arrangedItems.push({
          ...item,
          position: [
            clusterCenter[0] + Math.cos(angle) * radius,
            clusterCenter[1],
            clusterCenter[2] + Math.sin(angle) * radius
          ],
          rotation: [0, -angle, 0] // Face inward toward cluster center
        });
      });
    });

    return arrangedItems;
  }

  private groupItemsIntoClusters(items: SpatialItem[]): SpatialItem[][] {
    // Group items by content type or other criteria
    const clusters: Map<string, SpatialItem[]> = new Map();

    items.forEach(item => {
      const clusterKey = item.properties.contentType || 'unknown';
      if (!clusters.has(clusterKey)) {
        clusters.set(clusterKey, []);
      }
      clusters.get(clusterKey)!.push(item);
    });

    return Array.from(clusters.values());
  }

  private generateClusterPositions(clusterCount: number): [number, number, number][] {
    const positions: [number, number, number][] = [];
    const radius = 8;

    for (let i = 0; i < clusterCount; i++) {
      const angle = (i / clusterCount) * Math.PI * 2;
      positions.push([
        Math.cos(angle) * radius,
        0,
        Math.sin(angle) * radius
      ]);
    }

    return positions;
  }

  private getDefaultCameraState(type: string): CameraState {
    switch (type) {
      case 'gallery':
        return {
          position: [0, 2, 8],
          target: [0, 1, 0],
          fov: 60,
          near: 0.1,
          far: 100
        };
      case 'timeline':
        return {
          position: [0, 5, 10],
          target: [0, 0, 0],
          fov: 75,
          near: 0.1,
          far: 100
        };
      default:
        return {
          position: [0, 3, 6],
          target: [0, 0, 0],
          fov: 60,
          near: 0.1,
          far: 100
        };
    }
  }

  private getDefaultLighting(type: string): LightingConfig {
    return {
      ambient: { intensity: 0.4, color: '#ffffff' },
      directional: {
        intensity: 0.8,
        color: '#ffffff',
        position: [10, 10, 5]
      },
      shadows: type === 'gallery'
    };
  }

  private getDefaultInteractions(type: string): InteractionConfig {
    return {
      enableOrbitControls: true,
      enableSelection: true,
      enableMovement: type === 'custom',
      enableScaling: type === 'custom',
      enableRotation: type === 'custom'
    };
  }

  // Helper methods that would need to be implemented
  private async getLayoutById(layoutId: string): Promise<any> {
    // Implementation would fetch layout from database
    return {};
  }

  private async getCanvasById(canvasId: string): Promise<any> {
    // Implementation would fetch canvas from database
    return {};
  }
}

interface SpatialLayout {
  type: string;
  bounds: {
    min: [number, number, number];
    max: [number, number, number];
  };
  grid?: {
    size: number;
    visible: boolean;
  };
}

interface LightingConfig {
  ambient: {
    intensity: number;
    color: string;
  };
  directional: {
    intensity: number;
    color: string;
    position: [number, number, number];
  };
  shadows: boolean;
}

interface InteractionConfig {
  enableOrbitControls: boolean;
  enableSelection: boolean;
  enableMovement: boolean;
  enableScaling: boolean;
  enableRotation: boolean;
}
```

## AWS Deployment Guide

### Infrastructure Extension Strategy

**DO NOT CREATE NEW INFRASTRUCTURE**. Extend existing AWS resources:

1. **ElastiCache Redis**: Add to existing VPC `vpc-45bdcd38` using existing security groups
2. **RDS Aurora Serverless**: Add to existing VPC alongside current resources
3. **ECS Services**: Deploy to existing cluster `hh-bot-lancedb-cluster`
4. **ALB Target Groups**: Add new target groups to existing ALB `lancedb-bulletproof-simple-alb-705151448.us-east-1.elb.amazonaws.com`

### CloudFormation Template Extensions

Extend existing templates in `/infrastructure/`:
- `ecs-cluster.yml` - Add context and orchestration services
- Create `elasticache-redis.yml` - Redis cluster in existing VPC
- Create `rds-aurora.yml` - Aurora Serverless in existing VPC

### Container Deployment

**CRITICAL: PLATFORM ARCHITECTURE ALIGNMENT**

**DO NOT FUCK THIS UP AGAIN:**
- **Docker build**: ALWAYS use `--platform linux/amd64` (Intel/AMD)
- **ECS task definition**: ALWAYS use `"cpuArchitecture": "X86_64"`
- **NEVER mix ARM64 task definitions with AMD64 images**

```bash
# CORRECT Docker build command:
docker build --platform linux/amd64 -t hh-agent-app .

# CORRECT task definition runtimePlatform:
"runtimePlatform": {
  "cpuArchitecture": "X86_64",
  "operatingSystemFamily": "LINUX"
}
```

Use existing ECR pattern:
```bash
# Context Service
781939061434.dkr.ecr.us-east-1.amazonaws.com/hh-bot-context-service:latest

# Orchestration Service  
781939061434.dkr.ecr.us-east-1.amazonaws.com/hh-bot-orchestration-service:latest

# Agent App Service
781939061434.dkr.ecr.us-east-1.amazonaws.com/hh-agent-app:latest
```

**PLATFORM MISMATCH = DEPLOYMENT FAILURE**
- Symptoms: `CannotPullContainerError: image Manifest does not contain descriptor matching platform`
- Fix: Rebuild image with correct platform OR update task definition platform
- Prevention: Always verify platform alignment before deploy

### Environment Variables

**Production Environment:**
- `REDIS_URL`: ElastiCache endpoint in existing VPC
- `DATABASE_URL`: Aurora Serverless endpoint in existing VPC
- `AWS_REGION`: `us-east-1`
- `AWS_ACCOUNT_ID`: `781939061434`

**Development Environment:**
- Services include mock implementations when AWS resources unavailable
- No local Redis/PostgreSQL required for development

This technical specification provides the foundation for implementing the Phase 2 agentic system with a focus on practical, deployable solutions that leverage existing AWS infrastructure.

This technical specification focuses on the essential components needed for the vertical slice approach. The implementations prioritize working functionality over comprehensive features, with Redis-based context management, correlation ID tracing, and simplified tool coverage.

The remaining weeks (5-12) build upon this foundation with enhanced tool coverage, improved spatial interaction, basic quality control, and performance optimizations based on real usage patterns. Each enhancement is driven by actual user feedback rather than theoretical requirements.
