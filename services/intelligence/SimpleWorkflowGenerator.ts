import { SimpleIntentClassifier, SimpleIntent } from './SimpleIntentClassifier';
import { SimpleLLMRouter } from './SimpleLLMRouter';
import { UniversalToolRegistry } from '../tools/UniversalToolRegistry';
import { ToolExecutor } from '../tools/ToolExecutor';
import { RedisContextService } from '../context/RedisContextService';

export interface WorkflowExecution {
  id: string;
  intent: SimpleIntent;
  status: 'pending' | 'running' | 'completed' | 'failed';
  totalCost: number;
  llmCost: number;
  toolCost: number;
  correlationId: string;
  userId: string;
  startTime: number;
  endTime?: number;
  result?: any;
  error?: string;
}

export interface WorkflowResult {
  success: boolean;
  execution: WorkflowExecution;
  message: string;
  cost: number;
}

export class SimpleWorkflowGenerator {
  private intentClassifier: SimpleIntentClassifier;
  private llmRouter: SimpleLLMRouter;
  private activeWorkflows: Map<string, WorkflowExecution> = new Map();

  constructor(
    private toolRegistry: UniversalToolRegistry,
    private toolExecutor: ToolExecutor,
    private contextService: RedisContextService
  ) {
    const availableTools = Array.from(this.toolRegistry.getAllTools().keys());
    this.intentClassifier = new SimpleIntentClassifier(availableTools);
    this.llmRouter = new SimpleLLMRouter();
  }

  async processNaturalLanguageRequest(
    userMessage: string,
    userId: string,
    tenantId: string = 'default'
  ): Promise<WorkflowResult> {
    const correlationId = `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    const startTime = Date.now();

    console.log(`[${correlationId}] Processing: "${userMessage}"`);

    try {
      // Get user context
      const userContext = await this.contextService.getUserContext(userId, tenantId);

      // Classify intent with cost tracking
      const { intent } = await this.intentClassifier.classifyIntent(userMessage, { userId });
      const llmCost = this.intentClassifier.getCostStats().totalCost;

      console.log(`[${correlationId}] Intent: ${intent.intent} (confidence: ${intent.confidence})`);

      // Create workflow execution
      const workflowExecution: WorkflowExecution = {
        id: correlationId,
        intent,
        status: 'pending',
        totalCost: 0,
        llmCost,
        toolCost: 0,
        correlationId,
        userId,
        startTime
      };

      this.activeWorkflows.set(correlationId, workflowExecution);

      // Execute the workflow
      const result = await this.executeWorkflow(workflowExecution);

      const totalTime = Date.now() - startTime;
      console.log(`[${correlationId}] Workflow completed in ${totalTime}ms (cost: $${result.cost.toFixed(4)})`);

      return result;

    } catch (error) {
      console.error(`[${correlationId}] Workflow processing failed:`, error);

      return {
        success: false,
        execution: {
          id: correlationId,
          intent: {
            intent: 'chat',
            confidence: 0,
            tool_name: 'chat',
            parameters: { message: userMessage, userId },
            reasoning: 'Failed to process request'
          },
          status: 'failed',
          totalCost: 0,
          llmCost: 0,
          toolCost: 0,
          correlationId,
          userId,
          startTime,
          endTime: Date.now(),
          error: error instanceof Error ? error.message : 'Unknown error'
        },
        message: `I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        cost: 0
      };
    }
  }

  private async executeWorkflow(workflow: WorkflowExecution): Promise<WorkflowResult> {
    workflow.status = 'running';
    this.activeWorkflows.set(workflow.id, workflow);

    console.log(`[${workflow.correlationId}] Executing workflow: ${workflow.intent.tool_name}`);

    try {
      const userContext = { userId: workflow.userId, tenantId: 'default' };

      // Execute all planned steps in order (generalized chaining)
      const steps = workflow.intent.workflow_steps && workflow.intent.workflow_steps.length > 0
        ? workflow.intent.workflow_steps
        : [{ tool_name: workflow.intent.tool_name, parameters: workflow.intent.parameters }];

      let lastExecution: any = null;
      let lastGeneratedUrl: string | null = null;

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const params = { ...step.parameters } as any;

        // Pass search results to pinToCanvas step
        if (step.tool_name === 'pinToCanvas' && lastExecution?.result) {
          // Unified search result normalized to array earlier, but be defensive
          const raw = (lastExecution.result as any);
          const rawResults = raw?.results || raw?.payload?.results || raw;
          const resultArray = Array.isArray(rawResults)
            ? rawResults
            : (Array.isArray(rawResults?.all) ? rawResults.all : []);

          const requestedCount = typeof params.count === 'number' && params.count > 0 ? params.count : resultArray.length;

          const itemsToPin = resultArray
            .slice(0, requestedCount)
            .map((r: any) => ({
              contentId: r?.id || r?.slug || r?.contentId || r?._id || r?.uuid || '',
              position: { x: 100, y: 100 }
            }))
            .filter((it: any) => typeof it.contentId === 'string' && it.contentId.length > 0);

          if (itemsToPin.length > 0) {
            params.items = itemsToPin;
            console.log(`[${workflow.correlationId}] INFO: Passing ${itemsToPin.length} search results to pinToCanvas`);
          } else {
            console.warn(`[${workflow.correlationId}] WARN: No pin-ready items derived from search results`);
          }
        }

        // Resolve tool name to a registered backend tool, or skip if UI-only
        const availableTools = this.toolRegistry.getToolNames();
        let toolNameToExecute = step.tool_name;
        if (!availableTools.includes(toolNameToExecute)) {
          // Map common synonyms from planner/LLM to actual backend tools
          if (toolNameToExecute === 'nameImage') {
            // Prefer server-side rename only if we have an assetId
            toolNameToExecute = 'renameAsset';
            if (typeof (params as any).newFilename !== 'string' && typeof (params as any).name === 'string') {
              (params as any).newFilename = (params as any).name;
              delete (params as any).name;
            }
            const hasAssetId = typeof (params as any).assetId === 'string' && (params as any).assetId.length > 0;
            if (!hasAssetId) {
              console.log(`[${workflow.correlationId}] INFO: Skipping nameImage (no assetId) — handled client-side`);
              continue;
            }
          } else if (toolNameToExecute === 'saveImage') {
            // UI-only step for now; persistence handled client-side
            console.log(`[${workflow.correlationId}] INFO: Skipping saveImage — handled client-side`);
            continue;
          } else {
            console.warn(`[${workflow.correlationId}] WARN: Tool not registered: ${toolNameToExecute}. Skipping step.`);
            continue;
          }
        }

        // Propagate generated IDs where possible
        if (!params.imageId && lastExecution?.result?.generatedId) {
          params.imageId = lastExecution.result.generatedId;
        }

        // For video generation, pass the previous image URL as refs
        if (step.tool_name === 'generateContent' && params.type === 'video' && lastGeneratedUrl) {
          if (!params.settings) params.settings = {};
          if (!params.settings.refs) params.settings.refs = [];
          params.settings.refs.push(lastGeneratedUrl);
          console.log(`[${workflow.correlationId}] INFO: Added image ref for video generation: ${lastGeneratedUrl}`);
        }

        // Skip UI-only rename if we don't have an asset identifier to rename server-side
        if (step.tool_name === 'renameAsset') {
          const hasAssetId = typeof params.assetId === 'string' && params.assetId.length > 0;
          const hasFilename = typeof params.newFilename === 'string' && params.newFilename.length > 0;
          if (!hasAssetId) {
            console.log(`[${workflow.correlationId}] INFO: Skipping renameAsset step (no assetId yet). Defer to UI action.`);
            continue;
          }
          // Normalize name -> newFilename if classifier provided 'name'
          if (!hasFilename && typeof (params as any).name === 'string') {
            (params as any).newFilename = (params as any).name;
            delete (params as any).name;
          }
        }
        console.log(`[${workflow.correlationId}] DEBUG: step ${i + 1}/${steps.length} -> ${toolNameToExecute} params=`, JSON.stringify(params));
        lastExecution = await this.toolExecutor.executeTool(toolNameToExecute, params, userContext);
        if (lastExecution.status === 'failed') {
          workflow.status = 'failed';
          workflow.error = lastExecution.error;
          workflow.endTime = Date.now();
          return {
            success: false,
            execution: workflow,
            message: `I encountered an issue: ${lastExecution.error}`,
            cost: workflow.totalCost
          };
        }
      }

      // Calculate costs
      const toolCost = 0.001; // Rough estimate for tool execution
      workflow.toolCost = toolCost;
      workflow.totalCost = workflow.llmCost + workflow.toolCost;

      if (lastExecution?.status === 'completed') {
        workflow.status = 'completed';
        workflow.result = lastExecution.result;
        workflow.endTime = Date.now();

        // Update user context based on successful execution
        await this.updateUserContextFromWorkflow(workflow);

        const message = this.generateSuccessMessage(workflow);

        return {
          success: true,
          execution: workflow,
          message,
          cost: workflow.totalCost
        };

      } else {
        // Should not reach here, but keep defensive fallback
        workflow.status = 'failed';
        workflow.error = 'Unknown execution state';
        workflow.endTime = Date.now();
        return { success: false, execution: workflow, message: 'Unknown execution state', cost: workflow.totalCost };
      }

    } catch (error) {
      workflow.status = 'failed';
      workflow.error = error instanceof Error ? error.message : 'Unknown error';
      workflow.endTime = Date.now();

      console.error(`[${workflow.correlationId}] Workflow execution failed:`, error);

      return {
        success: false,
        execution: workflow,
        message: `Workflow execution failed: ${workflow.error}`,
        cost: workflow.totalCost
      };
    }
  }

  private generateSuccessMessage(workflow: WorkflowExecution): string {
    const intent = workflow.intent;

    switch (intent.intent) {
      case 'search':
        const query = intent.parameters.query;
        return query ? `Found results for "${query}".` : 'Search completed successfully.';

      case 'create':
        return `Successfully created your ${intent.tool_name.replace('create', '').toLowerCase()}.`;

      case 'update':
        return 'Update completed successfully.';

      case 'chat':
        return workflow.result?.response || 'Hello! How can I help you?';

      default:
        return 'Request completed successfully.';
    }
  }

  private async updateUserContextFromWorkflow(workflow: WorkflowExecution) {
    try {
      const updates: any = {};

      // Update context based on successful workflow results
      if (workflow.result) {
        switch (workflow.intent.tool_name) {
          case 'createCanvas':
            if (workflow.result.canvas?.id) {
              updates.lastCanvasId = workflow.result.canvas.id;
            }
            break;

          case 'createProject':
            if (workflow.result.project?.id) {
              updates.lastProjectId = workflow.result.project.id;
            }
            break;

          case 'searchUnified':
            if (workflow.intent.parameters.query) {
              await this.contextService.addRecentSearch(workflow.userId, 'default', workflow.intent.parameters.query
              );
            }
            break;
        }
      }

      if (Object.keys(updates).length > 0) {
        await this.contextService.updateUserContextWithParams(workflow.userId, 'default', updates);
      }

    } catch (error) {
      console.error(`Failed to update user context from workflow:`, error);
    }
  }

  // Workflow management
  getActiveWorkflows(userId?: string): WorkflowExecution[] {
    const workflows = Array.from(this.activeWorkflows.values());
    return userId ? workflows.filter(w => w.userId === userId) : workflows;
  }

  getWorkflow(workflowId: string): WorkflowExecution | undefined {
    return this.activeWorkflows.get(workflowId);
  }

  // Cost and usage statistics
  getUsageStats() {
    const intentStats = this.intentClassifier.getCostStats();
    const llmStats = this.llmRouter.getCostStats();
    const providerStatus = this.llmRouter.getProviderStatus();

    const workflows = Array.from(this.activeWorkflows.values());
    const totalWorkflowCost = workflows.reduce((sum, w) => sum + w.totalCost, 0);

    return {
      intent: intentStats,
      llm: llmStats,
      providers: providerStatus,
      workflows: {
        active: workflows.filter(w => w.status === 'running').length,
        total: workflows.length,
        completed: workflows.filter(w => w.status === 'completed').length,
        failed: workflows.filter(w => w.status === 'failed').length,
        totalCost: totalWorkflowCost,
        averageCost: workflows.length > 0 ? totalWorkflowCost / workflows.length : 0
      }
    };
  }

  // Cost controls
  checkCostLimits(dailyLimit: number = 10, monthlyLimit: number = 100) {
    const llmLimits = this.llmRouter.checkCostLimits(dailyLimit);
    const stats = this.getUsageStats();

    return {
      llm: llmLimits,
      workflow: {
        exceeded: stats.workflows.totalCost > dailyLimit,
        warning: stats.workflows.totalCost > dailyLimit * 0.8
      },
      total: {
        exceeded: llmLimits.exceeded || stats.workflows.totalCost > dailyLimit,
        warning: llmLimits.warning || stats.workflows.totalCost > dailyLimit * 0.8
      }
    };
  }

  // Provider health monitoring
  async checkProviderHealth() {
    return await this.llmRouter.checkProviderHealth();
  }

  resetUsageStats() {
    this.intentClassifier.resetCostTracking();
    this.llmRouter.resetCostTracking();
    this.activeWorkflows.clear();
  }
}
