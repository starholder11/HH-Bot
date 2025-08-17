import { StateGraph, START, END } from "@langchain/langgraph";
import { RedisContextService, WorkflowState } from '../context/RedisContextService';
import { Pool } from 'pg';

interface WorkflowStep {
  id: string;
  type: string;
  description: string;
  execute: (state: WorkflowState, context: any) => Promise<any>;
}

interface WorkflowDefinition {
  name: string;
  steps: WorkflowStep[];
  description: string;
}

export class BasicOrchestrator {
  private contextService: RedisContextService;
  private db: Pool;
  private workflows: Map<string, WorkflowDefinition> = new Map();

  constructor(contextService: RedisContextService, dbPool: Pool) {
    this.contextService = contextService;
    this.db = dbPool;
    this.initializeWorkflows();
  }

  /**
   * Execute a workflow
   */
  async executeWorkflow(
    workflowType: string,
    userId: string,
    tenantId: string,
    input: Record<string, any>,
    correlationId?: string
  ): Promise<string> {
    const corrId = correlationId || this.contextService.generateCorrelationId();

    console.log(`[${corrId}] Starting workflow execution:`, {
      workflowType,
      userId,
      tenantId,
      input
    });

    try {
      // Create workflow state
      const workflowState = await this.contextService.createWorkflowState(
        userId,
        tenantId,
        workflowType,
        corrId,
        input
      );

      // Log workflow start
      await this.logWorkflowEvent(
        workflowState.executionId,
        'workflow_started',
        { workflowType, input },
        corrId
      );

      // Update state to running
      workflowState.status = 'running';
      await this.contextService.updateWorkflowState(workflowState);

      // Execute workflow steps
      const workflow = this.workflows.get(workflowType);
      if (!workflow) {
        throw new Error(`Unknown workflow type: ${workflowType}`);
      }

      await this.executeWorkflowSteps(workflow, workflowState, corrId);

      // Mark as completed
      workflowState.status = 'completed';
      workflowState.currentStep = 'completed';
      await this.contextService.updateWorkflowState(workflowState);

      await this.logWorkflowEvent(
        workflowState.executionId,
        'workflow_completed',
        { results: workflowState.results },
        corrId
      );

      console.log(`[${corrId}] Workflow completed:`, workflowState.executionId);
      return workflowState.executionId;

    } catch (error) {
      console.error(`[${corrId}] Workflow execution failed:`, error);

      // Try to update workflow state to failed
      try {
        const state = await this.contextService.getWorkflowState(corrId);
        if (state) {
          state.status = 'failed';
          state.errors.push({
            step: state.currentStep,
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString(),
            correlationId: corrId
          });
          await this.contextService.updateWorkflowState(state);
        }
      } catch (updateError) {
        console.error(`[${corrId}] Failed to update workflow state:`, updateError);
      }

      throw error;
    }
  }

  /**
   * Get workflow status
   */
  async getWorkflowStatus(executionId: string): Promise<WorkflowState | null> {
    return await this.contextService.getWorkflowState(executionId);
  }

  /**
   * Pause a running workflow
   */
  async pauseWorkflow(executionId: string, correlationId: string): Promise<void> {
    console.log(`[${correlationId}] Pausing workflow:`, executionId);

    const state = await this.contextService.getWorkflowState(executionId);
    if (!state) {
      throw new Error('Workflow not found');
    }

    if (state.status !== 'running') {
      throw new Error(`Cannot pause workflow in status: ${state.status}`);
    }

    state.status = 'paused';
    await this.contextService.updateWorkflowState(state);

    await this.logWorkflowEvent(
      executionId,
      'workflow_paused',
      { pausedAt: state.currentStep },
      correlationId
    );
  }

  /**
   * Resume a paused workflow
   */
  async resumeWorkflow(executionId: string, correlationId: string): Promise<void> {
    console.log(`[${correlationId}] Resuming workflow:`, executionId);

    const state = await this.contextService.getWorkflowState(executionId);
    if (!state) {
      throw new Error('Workflow not found');
    }

    if (state.status !== 'paused') {
      throw new Error(`Cannot resume workflow in status: ${state.status}`);
    }

    state.status = 'running';
    await this.contextService.updateWorkflowState(state);

    await this.logWorkflowEvent(
      executionId,
      'workflow_resumed',
      { resumedAt: state.currentStep },
      correlationId
    );

    // Continue execution from current step
    const workflow = this.workflows.get(state.workflowType);
    if (workflow) {
      await this.executeWorkflowSteps(workflow, state, correlationId);
    }
  }

  /**
   * Cancel a workflow
   */
  async cancelWorkflow(executionId: string, correlationId: string): Promise<void> {
    console.log(`[${correlationId}] Cancelling workflow:`, executionId);

    const state = await this.contextService.getWorkflowState(executionId);
    if (!state) {
      throw new Error('Workflow not found');
    }

    state.status = 'failed';
    state.errors.push({
      step: state.currentStep,
      error: 'Workflow cancelled by user',
      timestamp: new Date().toISOString(),
      correlationId
    });

    await this.contextService.updateWorkflowState(state);

    await this.logWorkflowEvent(
      executionId,
      'workflow_cancelled',
      { cancelledAt: state.currentStep },
      correlationId
    );
  }

  // Private methods

  private async executeWorkflowSteps(
    workflow: WorkflowDefinition,
    state: WorkflowState,
    correlationId: string
  ): Promise<void> {
    console.log(`[${correlationId}] Executing workflow steps:`, workflow.name);

    for (const step of workflow.steps) {
      if (state.status !== 'running') {
        console.log(`[${correlationId}] Workflow not running, stopping execution`);
        break;
      }

      console.log(`[${correlationId}] Executing step:`, step.id);

      state.currentStep = step.id;
      await this.contextService.updateWorkflowState(state);

      const stepStartTime = Date.now();

      try {
        const result = await step.execute(state, {
          correlationId,
          contextService: this.contextService
        });

        state.results[step.id] = result;
        await this.contextService.updateWorkflowState(state);

        const duration = Date.now() - stepStartTime;

        await this.logWorkflowEvent(
          state.executionId,
          'step_completed',
          {
            stepId: step.id,
            stepType: step.type,
            duration,
            result
          },
          correlationId
        );

        console.log(`[${correlationId}] Step completed:`, step.id, `(${duration}ms)`);

      } catch (error) {
        const duration = Date.now() - stepStartTime;

        console.error(`[${correlationId}] Step failed:`, step.id, error);

        state.errors.push({
          step: step.id,
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
          correlationId
        });

        await this.logWorkflowEvent(
          state.executionId,
          'step_failed',
          {
            stepId: step.id,
            stepType: step.type,
            duration,
            error: error instanceof Error ? error.message : 'Unknown error'
          },
          correlationId
        );

        throw error;
      }
    }
  }

  private async logWorkflowEvent(
    executionId: string,
    eventType: string,
    data: any,
    correlationId: string
  ): Promise<void> {
    try {
      await this.db.query(`
        INSERT INTO workflow_events
        (execution_id, event_type, event_data, correlation_id, created_at)
        VALUES ($1, $2, $3, $4, NOW())
      `, [executionId, eventType, JSON.stringify(data), correlationId]);
    } catch (error) {
      console.error(`[${correlationId}] Failed to log workflow event:`, error);
      // Don't throw - logging failures shouldn't stop workflow execution
    }
  }

  private initializeWorkflows(): void {
    // Simple test workflow
    this.workflows.set('test_workflow', {
      name: 'Test Workflow',
      description: 'A simple test workflow for validation',
      steps: [
        {
          id: 'validate_input',
          type: 'validation',
          description: 'Validate workflow input',
          execute: async (state: WorkflowState, context: any) => {
            console.log(`[${context.correlationId}] Validating input:`, state.context);

            if (!state.context.testParam) {
              throw new Error('Missing required parameter: testParam');
            }

            return { valid: true, validatedAt: new Date().toISOString() };
          }
        },
        {
          id: 'process_data',
          type: 'processing',
          description: 'Process the validated data',
          execute: async (state: WorkflowState, context: any) => {
            console.log(`[${context.correlationId}] Processing data`);

            // Simulate some processing time
            await new Promise(resolve => setTimeout(resolve, 1000));

            return {
              processed: true,
              processedData: `Processed: ${state.context.testParam}`,
              processedAt: new Date().toISOString()
            };
          }
        },
        {
          id: 'finalize',
          type: 'finalization',
          description: 'Finalize the workflow',
          execute: async (state: WorkflowState, context: any) => {
            console.log(`[${context.correlationId}] Finalizing workflow`);

            return {
              finalized: true,
              finalizedAt: new Date().toISOString(),
              summary: `Workflow completed for: ${state.context.testParam}`
            };
          }
        }
      ]
    });

    console.log('Initialized workflows:', Array.from(this.workflows.keys()));
  }
}
