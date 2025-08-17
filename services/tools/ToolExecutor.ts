// services/tools/ToolExecutor.ts
import { ToolRegistry, ToolDefinition } from './ToolRegistry';
import { RedisContextService } from '../context/RedisContextService';

export interface ToolExecution {
  id: string;
  toolName: string;
  parameters: any;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: any;
  error?: string;
  correlationId: string;
  userId?: string;
  tenantId?: string;
}

export interface ToolChain {
  id: string;
  name: string;
  steps: Array<{
    toolName: string;
    parameters: any;
    condition?: (previousResults: any[]) => boolean;
  }>;
  userId?: string;
  tenantId?: string;
}

export class ToolExecutor {
  private registry: ToolRegistry;
  private contextService?: RedisContextService;
  private executions: Map<string, ToolExecution> = new Map();
  private chains: Map<string, ToolChain> = new Map();

  constructor(registry: ToolRegistry, contextService?: RedisContextService) {
    this.registry = registry;
    this.contextService = contextService;
  }

  async executeTool(
    toolName: string,
    parameters: any,
    userContext?: { userId: string; tenantId: string }
  ): Promise<ToolExecution> {
    const correlationId = this.contextService?.generateCorrelationId() || `exec_${Date.now()}`;
    const executionId = `${toolName}_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;

    const execution: ToolExecution = {
      id: executionId,
      toolName,
      parameters,
      startTime: Date.now(),
      status: 'pending',
      correlationId,
      userId: userContext?.userId,
      tenantId: userContext?.tenantId,
    };

    this.executions.set(executionId, execution);
    console.log(`[${correlationId}] Starting tool execution: ${toolName} (${executionId})`);

    try {
      const tool = this.registry.getTool(toolName);
      if (!tool) {
        throw new Error(`Tool not found: ${toolName}`);
      }

      execution.status = 'running';
      this.executions.set(executionId, execution);

      // Inject context if required
      if ((tool as ToolDefinition).requiresContext && userContext) {
        parameters.userId = userContext.userId;
        parameters.tenantId = userContext.tenantId;
      }

      console.log(`[${correlationId}] DEBUG: Final parameters before validation =`, JSON.stringify(parameters));

      // Runtime parameter validation against tool schema (zod)
      try {
        // Optional: some tools may not define schemas
        if ((tool as ToolDefinition).parameters) {
          const parseResult = (tool as ToolDefinition).parameters.safeParse(parameters);
          if (!parseResult.success) {
            throw new Error(`Invalid parameters for ${toolName}: ${parseResult.error.issues.map(i => i.path.join('.') + ' ' + i.message).join('; ')}`);
          }
          // Use parsed value to ensure defaults/coercions are applied
          parameters = parseResult.data;
        }
      } catch (validationError) {
        execution.endTime = Date.now();
        execution.duration = execution.endTime - execution.startTime;
        execution.status = 'failed';
        execution.error = validationError instanceof Error ? validationError.message : String(validationError);
        this.executions.set(executionId, execution);

        console.error(`[${correlationId}] Parameter validation failed for tool ${toolName}:`, execution.error);
        return execution;
      }

      // Execute the tool
      const result = await tool.execute(parameters, userContext);

      execution.endTime = Date.now();
      execution.duration = execution.endTime - execution.startTime;
      execution.status = 'completed';
      execution.result = result;

      this.executions.set(executionId, execution);

      // Record execution in context if available
      if (this.contextService && userContext) {
        await this.contextService.recordSessionEvent(
          userContext.userId,
          userContext.tenantId,
          'tool_executed',
          {
            toolName,
            executionId,
            duration: execution.duration,
            status: 'completed',
            correlationId
          }
        );
      }

      console.log(`[${correlationId}] Tool execution completed: ${toolName} (${execution.duration}ms)`);
      return execution;

    } catch (error) {
      execution.endTime = Date.now();
      execution.duration = execution.endTime - execution.startTime;
      execution.status = 'failed';
      execution.error = error instanceof Error ? error.message : String(error);

      this.executions.set(executionId, execution);

      // Record failure in context
      if (this.contextService && userContext) {
        await this.contextService.recordSessionEvent(
          userContext.userId,
          userContext.tenantId,
          'tool_execution_failed',
          {
            toolName,
            executionId,
            duration: execution.duration,
            error: execution.error,
            correlationId
          }
        );
      }

      console.error(`[${correlationId}] Tool execution failed: ${toolName} (${execution.duration}ms)`, error);
      return execution;
    }
  }

  async executeChain(
    chainId: string,
    userContext?: { userId: string; tenantId: string }
  ): Promise<ToolExecution[]> {
    const correlationId = this.contextService?.generateCorrelationId() || `chain_${Date.now()}`;
    console.log(`[${correlationId}] Starting tool chain execution: ${chainId}`);

    const chain = this.chains.get(chainId);
    if (!chain) {
      throw new Error(`Tool chain not found: ${chainId}`);
    }

    const executions: ToolExecution[] = [];
    const results: any[] = [];

    try {
      for (let i = 0; i < chain.steps.length; i++) {
        const step = chain.steps[i];

        // Check condition if provided
        if (step.condition && !step.condition(results)) {
          console.log(`[${correlationId}] Skipping step ${i + 1}: condition not met`);
          continue;
        }

        // Execute the tool
        const execution = await this.executeTool(
          step.toolName,
          step.parameters,
          userContext
        );

        executions.push(execution);
        results.push(execution.result);

        // Stop chain if step failed
        if (execution.status === 'failed') {
          console.error(`[${correlationId}] Chain execution stopped at step ${i + 1}: ${execution.error}`);
          break;
        }
      }

      // Record chain completion
      if (this.contextService && userContext) {
        await this.contextService.recordSessionEvent(
          userContext.userId,
          userContext.tenantId,
          'tool_chain_executed',
          {
            chainId,
            stepsCompleted: executions.length,
            totalSteps: chain.steps.length,
            correlationId
          }
        );
      }

      console.log(`[${correlationId}] Tool chain completed: ${executions.length}/${chain.steps.length} steps`);
      return executions;

    } catch (error) {
      console.error(`[${correlationId}] Tool chain execution failed:`, error);
      throw error;
    }
  }

  registerChain(chain: ToolChain) {
    this.chains.set(chain.id, chain);
    console.log(`Registered tool chain: ${chain.id} (${chain.steps.length} steps)`);
  }

  getExecution(executionId: string): ToolExecution | undefined {
    return this.executions.get(executionId);
  }

  getExecutionHistory(
    userId?: string,
    tenantId?: string,
    limit: number = 50
  ): ToolExecution[] {
    const executions = Array.from(this.executions.values())
      .filter(exec => {
        if (userId && exec.userId !== userId) return false;
        if (tenantId && exec.tenantId !== tenantId) return false;
        return true;
      })
      .sort((a, b) => b.startTime - a.startTime)
      .slice(0, limit);

    return executions;
  }

  getExecutionStats(userId?: string, tenantId?: string): any {
    const executions = this.getExecutionHistory(userId, tenantId, 1000);

    const stats = {
      total: executions.length,
      completed: executions.filter(e => e.status === 'completed').length,
      failed: executions.filter(e => e.status === 'failed').length,
      running: executions.filter(e => e.status === 'running').length,
      averageDuration: 0,
      toolUsage: {} as Record<string, number>,
      recentExecutions: executions.slice(0, 10)
    };

    // Calculate average duration for completed executions
    const completedWithDuration = executions.filter(e => e.status === 'completed' && e.duration);
    if (completedWithDuration.length > 0) {
      stats.averageDuration = completedWithDuration.reduce((sum, e) => sum + (e.duration || 0), 0) / completedWithDuration.length;
    }

    // Calculate tool usage
    executions.forEach(e => {
      stats.toolUsage[e.toolName] = (stats.toolUsage[e.toolName] || 0) + 1;
    });

    return stats;
  }

  // Cleanup old executions (keep last 1000 per user)
  cleanup(maxExecutions: number = 1000) {
    const executions = Array.from(this.executions.entries())
      .sort(([, a], [, b]) => b.startTime - a.startTime);

    if (executions.length > maxExecutions) {
      const toRemove = executions.slice(maxExecutions);
      toRemove.forEach(([id]) => {
        this.executions.delete(id);
      });
      console.log(`Cleaned up ${toRemove.length} old tool executions`);
    }
  }

  // Predefined tool chains for common workflows
  initializeCommonChains() {
    // Search and Pin workflow
    this.registerChain({
      id: 'search-and-pin',
      name: 'Search and Pin to Canvas',
      steps: [
        {
          toolName: 'searchUnified',
          parameters: { query: '', requestedMediaType: 'image' }
        },
        {
          toolName: 'createCanvas',
          parameters: { name: 'Search Results Canvas' },
          condition: (results) => results[0]?.result?.action === 'showResults'
        }
      ]
    });

    // Project Setup workflow
    this.registerChain({
      id: 'project-setup',
      name: 'Create Project and Canvas',
      steps: [
        {
          toolName: 'createProject',
          parameters: { name: '', description: '' }
        },
        {
          toolName: 'createCanvas',
          parameters: { name: 'Main Canvas', projectId: '' },
          condition: (results) => results[0]?.status === 'completed'
        }
      ]
    });

    console.log('Initialized common tool chains');
  }
}
