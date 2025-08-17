import { SimpleIntentClassifier, SimpleIntent } from './SimpleIntentClassifier';
import { SimpleLLMRouter } from './SimpleLLMRouter';
import { ToolExecutor } from '../tools/ToolExecutor';
import { RedisContextService } from '../context/RedisContextService';
import { WorkflowTemplates, WorkflowTemplate, WorkflowStep } from '../workflows/WorkflowTemplates';
import { EnhancedErrorHandler, ToolError, WorkflowCheckpoint } from '../tools/EnhancedErrorHandler';
import { WebSocketManager } from '../websocket/WebSocketManager';

export interface EnhancedWorkflowResult {
  message: string;
  intent: SimpleIntent;
  template?: WorkflowTemplate;
  execution?: any;
  checkpoint?: WorkflowCheckpoint;
  cost: { llm: number; tool: number; total: number };
  recoveryOptions?: any[];
  status: 'completed' | 'partial' | 'failed' | 'requires_approval';
}

export interface WorkflowProgress {
  workflowId: string;
  currentStep: number;
  totalSteps: number;
  stepName: string;
  status: 'running' | 'completed' | 'failed' | 'waiting_approval';
  message: string;
  timestamp: Date;
}

export class EnhancedWorkflowGenerator {
  private intentClassifier: SimpleIntentClassifier;
  private llmRouter: SimpleLLMRouter;
  private toolExecutor: ToolExecutor;
  private contextService: RedisContextService;
  private workflowTemplates: WorkflowTemplates;
  private errorHandler: EnhancedErrorHandler;
  private progressCallbacks: Map<string, (progress: WorkflowProgress) => void> = new Map();
  private wsManager?: WebSocketManager;

  constructor(
    intentClassifier: SimpleIntentClassifier,
    llmRouter: SimpleLLMRouter,
    toolExecutor: ToolExecutor,
    contextService: RedisContextService,
    wsManager?: WebSocketManager
  ) {
    this.intentClassifier = intentClassifier;
    this.llmRouter = llmRouter;
    this.toolExecutor = toolExecutor;
    this.contextService = contextService;
    this.workflowTemplates = new WorkflowTemplates();
    this.errorHandler = new EnhancedErrorHandler(contextService);
    this.wsManager = wsManager;
  }

  /**
   * Generate and execute enhanced workflow with templates and error recovery
   */
  async generateAndExecuteWorkflow(
    userMessage: string,
    userId: string,
    tenantId: string,
    correlationId: string,
    options?: {
      useTemplates?: boolean;
      requireApproval?: boolean;
      progressCallback?: (progress: WorkflowProgress) => void;
    }
  ): Promise<EnhancedWorkflowResult> {
    console.log(`[${correlationId}] Enhanced workflow generation started`);

    let llmCost = 0;
    let toolCost = 0;
    const workflowId = `workflow_${correlationId}`;

    // Register progress callback
    if (options?.progressCallback) {
      this.progressCallbacks.set(workflowId, options.progressCallback);
    }

    try {
      // 1. Classify Intent
      const context = await this.contextService.getUserContext(userId, tenantId);
      const { intent, cost: classificationCost } = await this.intentClassifier.classifyIntent(userMessage, context);
      llmCost += classificationCost;

      console.log(`[${correlationId}] Intent classified: ${intent.classification || intent.intent}`);

      // 2. Check for suitable templates
      let template: WorkflowTemplate | null = null;
      let workflowSteps: WorkflowStep[] = [];

      if (options?.useTemplates !== false) {
        const suitableTemplates = this.workflowTemplates.getTemplatesForIntent(intent.primary_intent || intent.intent, context);

        if (suitableTemplates.length > 0) {
          template = suitableTemplates[0]; // Use best match
          console.log(`[${correlationId}] Using template: ${template.name}`);

          // Extract parameters from user message and context
          const templateParams = await this.extractTemplateParameters(userMessage, intent, context, correlationId);
          const instantiatedSteps = this.workflowTemplates.instantiateTemplate(template.id, templateParams);

          if (instantiatedSteps) {
            workflowSteps = instantiatedSteps;
          }
        }
      }

      // 3. Fallback to intent-based workflow if no template
      if (workflowSteps.length === 0 && intent.workflow_steps) {
        workflowSteps = intent.workflow_steps.map((step, index) => ({
          id: `step_${index}`,
          name: step.tool_name,
          toolName: step.tool_name,
          parameters: step.parameters,
          description: `Execute ${step.tool_name}`
        }));
      }

      // 4. Request approval if required
      if (options?.requireApproval && workflowSteps.length > 1) {
        return {
          message: this.formatApprovalRequest(workflowSteps, template || undefined),
          intent,
          template: template || undefined,
          cost: { llm: llmCost, tool: toolCost, total: llmCost + toolCost },
          status: 'requires_approval'
        };
      }

      // 5. Execute workflow with enhanced error handling
      if (workflowSteps.length > 0) {
        const executionResult = await this.executeWorkflowWithRecovery(
          workflowSteps,
          userId,
          tenantId,
          correlationId,
          workflowId
        );

        toolCost += executionResult.cost;

        return {
          message: executionResult.message,
          intent,
          template: template || undefined,
          execution: executionResult.execution,
          checkpoint: executionResult.checkpoint as WorkflowCheckpoint | undefined,
          cost: { llm: llmCost, tool: toolCost, total: llmCost + toolCost },
          recoveryOptions: executionResult.recoveryOptions,
          status: executionResult.status
        };
      }

      // 6. Fallback to chat response
      console.log(`[${correlationId}] No workflow steps, generating chat response`);
      const { response, cost: chatCost } = this.llmRouter.routeRequest
        ? await this.llmRouter.routeRequest(userMessage, { correlationId })
        : { response: "I understand your request. How can I help you further?", cost: 0 };
      llmCost += chatCost;

      return {
        message: response,
        intent,
        cost: { llm: llmCost, tool: toolCost, total: llmCost + toolCost },
        status: 'completed'
      };

    } catch (error) {
      console.error(`[${correlationId}] Enhanced workflow generation failed:`, error);
      return {
        message: "I encountered an error while processing your request. Please try again or contact support if the issue persists.",
        intent: {
          intent: 'chat',
          confidence: 0,
          tool_name: 'chat',
          parameters: { message: userMessage },
          reasoning: 'error handling fallback',
          primary_intent: 'error_handling',
          classification: 'error',
          workflow_steps: [{ tool_name: 'chat', parameters: { message: userMessage } }]
        } as any,
        cost: { llm: llmCost, tool: toolCost, total: llmCost + toolCost },
        status: 'failed'
      };
    } finally {
      // Cleanup progress callback
      this.progressCallbacks.delete(workflowId);
    }
  }

  /**
   * Execute workflow with enhanced error recovery
   */
  private async executeWorkflowWithRecovery(
    steps: WorkflowStep[],
    userId: string,
    tenantId: string,
    correlationId: string,
    workflowId: string
  ): Promise<{
    message: string;
    execution: any[];
    checkpoint?: WorkflowCheckpoint;
    cost: number;
    recoveryOptions?: any[];
    status: 'completed' | 'partial' | 'failed';
  }> {
    const executedSteps: any[] = [];
    const stepResults: { [stepId: string]: any } = {};
    let totalCost = 0;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];

      // Update progress
      this.updateProgress(workflowId, {
        workflowId,
        currentStep: i + 1,
        totalSteps: steps.length,
        stepName: step.name,
        status: 'running',
        message: `Executing: ${step.description}`,
        timestamp: new Date()
      });

      try {
        // Check dependencies
        if (step.dependsOn) {
          const missingDeps = step.dependsOn.filter(depId => !stepResults[depId]);
          if (missingDeps.length > 0) {
            throw new Error(`Missing dependencies: ${missingDeps.join(', ')}`);
          }
        }

        // Resolve parameters with previous step results
        const resolvedParams = this.resolveStepParameters(step.parameters, stepResults, { userId, tenantId });

        console.log(`[${correlationId}] Executing step ${i + 1}/${steps.length}: ${step.name}`);

        const toolExecution = await this.toolExecutor.executeTool(
          step.toolName,
          resolvedParams,
          { userId, tenantId }
        );

        executedSteps.push(toolExecution);
        stepResults[step.id] = toolExecution.result;
        totalCost += toolExecution.duration ? toolExecution.duration / 1000000 : 0;

        if (toolExecution.status === 'failed') {
          // Create checkpoint before handling error
          const checkpoint = await this.errorHandler.createCheckpoint(
            workflowId,
            i,
            executedSteps,
            steps.slice(i + 1),
            { stepResults, userId, tenantId },
            correlationId
          );

          // Generate recovery options
          const toolError = this.errorHandler.createToolError(
            'TOOL_EXECUTION_FAILED',
            `Step "${step.name}" failed: ${toolExecution.error}`,
            toolExecution,
            step.toolName,
            resolvedParams,
            correlationId
          );

          return {
            message: `Workflow partially completed. ${this.errorHandler.formatUserError(toolError)}`,
            execution: executedSteps,
            checkpoint: (checkpoint as unknown) as WorkflowCheckpoint,
            cost: totalCost,
            recoveryOptions: toolError.recoveryOptions,
            status: 'partial'
          };
        }

        // Update progress
        this.updateProgress(workflowId, {
          workflowId,
          currentStep: i + 1,
          totalSteps: steps.length,
          stepName: step.name,
          status: 'completed',
          message: `Completed: ${step.description}`,
          timestamp: new Date()
        });

      } catch (error) {
        console.error(`[${correlationId}] Step ${step.name} failed:`, error);

        // Create checkpoint
        const checkpoint = await this.errorHandler.createCheckpoint(
          workflowId,
          i,
          executedSteps,
          steps.slice(i + 1),
          { stepResults, userId, tenantId },
          correlationId
        );

        const toolError = this.errorHandler.createToolError(
          'STEP_EXECUTION_ERROR',
          `Step "${step.name}" encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          { error, step },
          step.toolName,
          step.parameters,
          correlationId
        );

        return {
          message: `Workflow failed at step "${step.name}". ${this.errorHandler.formatUserError(toolError)}`,
          execution: executedSteps,
          checkpoint: (checkpoint as unknown) as WorkflowCheckpoint,
          cost: totalCost,
          recoveryOptions: toolError.recoveryOptions,
          status: 'failed'
        };
      }
    }

    // All steps completed successfully
    this.updateProgress(workflowId, {
      workflowId,
      currentStep: steps.length,
      totalSteps: steps.length,
      stepName: 'Workflow Complete',
      status: 'completed',
      message: 'All steps completed successfully',
      timestamp: new Date()
    });

    return {
      message: this.formatSuccessMessage(steps, executedSteps),
      execution: executedSteps,
      cost: totalCost,
      status: 'completed'
    };
  }

  /**
   * Resume workflow from checkpoint
   */
  async resumeWorkflow(
    workflowId: string,
    checkpointId: string,
    correlationId: string,
    recoveryAction?: { action: string; parameters?: any }
  ): Promise<EnhancedWorkflowResult> {
    console.log(`[${correlationId}] Resuming workflow ${workflowId} from checkpoint ${checkpointId}`);

    const checkpoint = await this.errorHandler.resumeFromCheckpoint(workflowId, checkpointId, correlationId);
    if (!checkpoint) {
      return {
        message: "Could not find the specified checkpoint to resume from.",
        intent: {
          intent: 'chat',
          confidence: 0,
          tool_name: 'chat',
          parameters: {},
          reasoning: 'checkpoint not found',
          primary_intent: 'checkpoint_not_found',
          classification: 'error',
          workflow_steps: []
        } as any,
        cost: { llm: 0, tool: 0, total: 0 },
        status: 'failed'
      };
    }

    // Apply recovery action if specified
    let remainingSteps = checkpoint.remainingSteps;
    if (recoveryAction) {
      remainingSteps = this.applyRecoveryAction(remainingSteps, recoveryAction);
    }

    // Continue execution from checkpoint
    const executionResult = await this.executeWorkflowWithRecovery(
      remainingSteps,
      checkpoint.context.userId,
      checkpoint.context.tenantId,
      correlationId,
      workflowId
    );

    return {
      message: `Resumed workflow: ${executionResult.message}`,
      intent: {
        intent: 'chat',
        confidence: 1,
        tool_name: 'chat',
        parameters: {},
        reasoning: 'resume notification',
        primary_intent: 'workflow_resume',
        classification: 'resume'
      },
      execution: executionResult.execution,
      checkpoint: executionResult.checkpoint as WorkflowCheckpoint | undefined,
      cost: { llm: 0, tool: executionResult.cost, total: executionResult.cost },
      recoveryOptions: executionResult.recoveryOptions,
      status: executionResult.status
    };
  }

  /**
   * Helper methods
   */
  private async extractTemplateParameters(
    userMessage: string,
    intent: SimpleIntent,
    context: any,
    correlationId: string
  ): Promise<{ [key: string]: any }> {
    // Simple parameter extraction - could be enhanced with NLP
    const params: { [key: string]: any } = {};

    // Extract common parameters from message
    const queryMatch = userMessage.match(/(?:search|find|look for)\s+(.+?)(?:\s+(?:and|then|,)|$)/i);
    if (queryMatch) {
      params.query = queryMatch[1].trim();
    }

    // Extract numbers for limits
    const numberMatch = userMessage.match(/(\d+)/);
    if (numberMatch) {
      params.limit = parseInt(numberMatch[1]);
    }

    // Extract names
    const nameMatch = userMessage.match(/(?:call|name)\s+(?:it|this)\s+(.+?)(?:\s|$)/i);
    if (nameMatch) {
      params.canvasName = nameMatch[1].trim();
      params.projectName = nameMatch[1].trim();
    }

    // Add context-based parameters
    if (context.recentSearches && context.recentSearches.length > 0) {
      params.recentQuery = context.recentSearches[0];
    }

    // Add timestamp for unique naming
    params.timestamp = new Date().toISOString().split('T')[0];

    return params;
  }

  private resolveStepParameters(
    templateParams: any,
    stepResults: { [stepId: string]: any },
    context: { userId: string; tenantId: string }
  ): any {
    if (typeof templateParams === 'string') {
      // Resolve step result references like {{step-id.result.property}}
      return templateParams.replace(/\{\{([^}]+)\}\}/g, (substring: string, path: string) => {
        const parts = path.split('.');
        let value = stepResults;

        for (const part of parts) {
          if (value && typeof value === 'object' && value.hasOwnProperty(part)) {
            value = value[part];
          } else {
            return substring; // Return original if path not found
          }
        }

        return String(value);
      });
    }

    if (Array.isArray(templateParams)) {
      return templateParams.map(item => this.resolveStepParameters(item, stepResults, context));
    }

    if (typeof templateParams === 'object' && templateParams !== null) {
      const resolved: any = {};
      for (const [key, value] of Object.entries(templateParams)) {
        resolved[key] = this.resolveStepParameters(value, stepResults, context);
      }
      // Add context parameters
      resolved.userId = context.userId;
      resolved.tenantId = context.tenantId;
      return resolved;
    }

    return templateParams;
  }

  private formatApprovalRequest(steps: WorkflowStep[], template?: WorkflowTemplate): string {
    let message = "I'd like to execute the following workflow:\n\n";

    if (template) {
      message += `**${template.name}**\n${template.description}\n\n`;
      message += `Estimated duration: ${template.estimatedDuration} seconds\n\n`;
    }

    message += "**Steps:**\n";
    steps.forEach((step, index) => {
      message += `${index + 1}. ${step.name}: ${step.description}\n`;
    });

    message += "\nShould I proceed with this workflow?";
    return message;
  }

  private formatSuccessMessage(steps: WorkflowStep[], executions: any[]): string {
    const lastExecution = executions[executions.length - 1];
    let message = `Successfully completed workflow with ${steps.length} steps.`;

    if (lastExecution?.result?.message) {
      message += ` ${lastExecution.result.message}`;
    }

    return message;
  }

  private applyRecoveryAction(steps: WorkflowStep[], recoveryAction: { action: string; parameters?: any }): WorkflowStep[] {
    switch (recoveryAction.action) {
      case 'retry':
        return steps; // No modification needed for retry
      case 'skip_step':
        return steps.slice(1); // Skip first step
      case 'modify_params':
        if (steps.length > 0 && recoveryAction.parameters) {
          steps[0] = {
            ...steps[0],
            parameters: { ...steps[0].parameters, ...recoveryAction.parameters }
          };
        }
        return steps;
      default:
        return steps;
    }
  }

  private updateProgress(workflowId: string, progress: WorkflowProgress) {
    const callback = this.progressCallbacks.get(workflowId);
    if (callback) {
      callback(progress);
    }

    // Also broadcast via WebSocket if available
    if (this.wsManager) {
      this.wsManager.broadcastWorkflowProgress(workflowId, progress);
    }
  }

  /**
   * Get workflow cost statistics
   */
  getWorkflowCostStats() {
    return {
      llm: this.llmRouter.getCostStats().totalCost,
      tool: this.toolExecutor.getExecutionStats().totalDuration / 1000000 || 0,
      total: this.llmRouter.getCostStats().totalCost + (this.toolExecutor.getExecutionStats().totalDuration / 1000000 || 0)
    };
  }

  /**
   * Reset cost tracking
   */
  resetCostTracking() {
    this.llmRouter.resetCostTracking();
    this.intentClassifier.resetCostTracking();
  }
}
