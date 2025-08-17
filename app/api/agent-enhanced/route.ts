import { NextRequest, NextResponse } from 'next/server';
import { RedisContextService } from '../../../services/context/RedisContextService';
import { ToolRegistry } from '../../../services/tools/ToolRegistry';
import { ToolExecutor } from '../../../services/tools/ToolExecutor';
import { SimpleIntentClassifier } from '../../../services/intelligence/SimpleIntentClassifier';
import { SimpleLLMRouter } from '../../../services/intelligence/SimpleLLMRouter';
import { EnhancedWorkflowGenerator, WorkflowProgress } from '../../../services/intelligence/EnhancedWorkflowGenerator';

export const dynamic = 'force-dynamic';

// Lazy service initialization to avoid build-time Redis connection
let contextService: RedisContextService | null = null;
let toolRegistry: ToolRegistry | null = null;
let toolExecutor: ToolExecutor | null = null;
let llmRouter: SimpleLLMRouter | null = null;

function initializeServices() {
  if (!contextService) {
    contextService = new RedisContextService();
    toolRegistry = new ToolRegistry(contextService);
    toolExecutor = new ToolExecutor(toolRegistry, contextService);
    llmRouter = new SimpleLLMRouter();
  }
  return { contextService, toolRegistry, toolExecutor, llmRouter };
}
// Initialize services lazily in request handlers
let intentClassifier: SimpleIntentClassifier | null = null;
let enhancedWorkflowGenerator: EnhancedWorkflowGenerator | null = null;

// Store active workflows for progress tracking
const activeWorkflows = new Map<string, {
  userId: string;
  tenantId: string;
  startTime: Date;
  lastProgress?: WorkflowProgress;
}>();

// Cost limits
const COST_LIMITS = {
  LLM_DAILY_HARD: 10.0,
  LLM_DAILY_WARNING: 5.0,
  WORKFLOW_PER_REQUEST_HARD: 1.0,
  WORKFLOW_PER_REQUEST_WARNING: 0.5,
  TOTAL_DAILY_HARD: 15.0,
  TOTAL_DAILY_WARNING: 7.5
};

export async function POST(request: NextRequest) {
  const { contextService, toolRegistry, toolExecutor, llmRouter } = initializeServices();

  // Initialize enhanced services if not already done
  if (!intentClassifier) {
    intentClassifier = new SimpleIntentClassifier(llmRouter!, toolRegistry!.getAllTools().map(t => t.name));
    enhancedWorkflowGenerator = new EnhancedWorkflowGenerator(intentClassifier, llmRouter!, toolExecutor!, contextService!);
  }

  const correlationId = contextService!.generateCorrelationId();
  console.log(`[${correlationId}] Enhanced Agent request received`);

  try {
    const body = await request.json();
    const {
      message,
      userId = 'test-user',
      tenantId = 'default',
      useTemplates = true,
      requireApproval = false,
      resumeWorkflow = null // { workflowId, checkpointId, recoveryAction? }
    } = body;

    if (!message && !resumeWorkflow) {
      return NextResponse.json(
        { error: 'Message or resumeWorkflow is required', correlationId },
        { status: 400 }
      );
    }

    // Check cost limits
    const currentCosts = enhancedWorkflowGenerator!.getWorkflowCostStats();
    const costCheck = {
      llm: {
        exceeded: currentCosts.llm > COST_LIMITS.LLM_DAILY_HARD,
        warning: currentCosts.llm > COST_LIMITS.LLM_DAILY_WARNING
      },
      workflow: {
        exceeded: false,
        warning: false
      },
      total: {
        exceeded: currentCosts.total > COST_LIMITS.TOTAL_DAILY_HARD,
        warning: currentCosts.total > COST_LIMITS.TOTAL_DAILY_WARNING
      }
    };

    if (costCheck.llm.exceeded || costCheck.total.exceeded) {
      return NextResponse.json(
        {
          success: false,
          message: 'Daily cost limit exceeded. Please try again tomorrow or contact support.',
          costCheck,
          correlationId
        },
        { status: 429 }
      );
    }

    let workflowResult;

    if (resumeWorkflow) {
      // Resume existing workflow
      console.log(`[${correlationId}] Resuming workflow: ${resumeWorkflow.workflowId}`);
      workflowResult = await enhancedWorkflowGenerator!.resumeWorkflow(
        resumeWorkflow.workflowId,
        resumeWorkflow.checkpointId,
        correlationId,
        resumeWorkflow.recoveryAction
      );
    } else {
      // Create progress callback for real-time updates
      const progressCallback = (progress: WorkflowProgress) => {
        console.log(`[${correlationId}] Workflow progress:`, progress);
        // Store progress for potential WebSocket broadcasting
        const workflowKey = `workflow_${correlationId}`;
        if (activeWorkflows.has(workflowKey)) {
          activeWorkflows.get(workflowKey)!.lastProgress = progress;
        }
      };

      // Track active workflow
      activeWorkflows.set(`workflow_${correlationId}`, {
        userId,
        tenantId,
        startTime: new Date()
      });

      // Execute new workflow
      workflowResult = await enhancedWorkflowGenerator!.generateAndExecuteWorkflow(
        message,
        userId,
        tenantId,
        correlationId,
        {
          useTemplates,
          requireApproval,
          progressCallback
        }
      );

      // Clean up active workflow tracking
      activeWorkflows.delete(`workflow_${correlationId}`);
    }

    // Update cost check after execution
    costCheck.workflow.exceeded = workflowResult.cost.total > COST_LIMITS.WORKFLOW_PER_REQUEST_HARD;
    costCheck.workflow.warning = workflowResult.cost.total > COST_LIMITS.WORKFLOW_PER_REQUEST_WARNING;

    if (costCheck.workflow.exceeded) {
      return NextResponse.json(
        {
          success: false,
          message: 'This request would exceed the per-workflow cost limit. Please try a simpler request.',
          costCheck,
          correlationId
        },
        { status: 429 }
      );
    }

    console.log(`[${correlationId}] Enhanced Agent response generated. Status: ${workflowResult.status}`);

    return NextResponse.json({
      success: true,
      message: workflowResult.message,
      intent: workflowResult.intent,
      template: workflowResult.template,
      execution: workflowResult.execution,
      checkpoint: workflowResult.checkpoint,
      cost: workflowResult.cost,
      costCheck,
      recoveryOptions: workflowResult.recoveryOptions,
      status: workflowResult.status,
      correlationId
    });

  } catch (error) {
    console.error(`[${correlationId}] Enhanced Agent POST failed:`, error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const { contextService, toolRegistry, toolExecutor, llmRouter } = initializeServices();

  // Initialize enhanced services if not already done
  if (!intentClassifier) {
    intentClassifier = new SimpleIntentClassifier(llmRouter!, toolRegistry!.getAllTools().map(t => t.name));
    enhancedWorkflowGenerator = new EnhancedWorkflowGenerator(intentClassifier, llmRouter!, toolExecutor!, contextService!);
  }

  const correlationId = contextService!.generateCorrelationId();
  console.log(`[${correlationId}] Enhanced Agent GET request received`);

  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const userId = searchParams.get('userId') || 'test-user';
    const tenantId = searchParams.get('tenantId') || 'default';

    switch (action) {
      case 'health':
        const contextHealth = await contextService!.checkHealth();
        const providerHealth = await llmRouter!.checkProviderHealth();
        return NextResponse.json({
          success: true,
          service: 'agent-enhanced',
          timestamp: new Date().toISOString(),
          context: contextHealth,
          llmProviders: providerHealth,
          activeWorkflows: activeWorkflows.size,
          correlationId
        });

      case 'templates':
        const category = searchParams.get('category');
        const complexity = searchParams.get('complexity');
        const tags = searchParams.get('tags')?.split(',');
        const query = searchParams.get('query');

        const templates = enhancedWorkflowGenerator!['workflowTemplates'].searchTemplates({
          category: category || undefined,
          complexity: complexity || undefined,
          tags: tags || undefined,
          query: query || undefined
        });

        return NextResponse.json({
          success: true,
          templates: templates.map(t => ({
            id: t.id,
            name: t.name,
            description: t.description,
            category: t.category,
            tags: t.tags,
            estimatedDuration: t.estimatedDuration,
            complexity: t.complexity,
            stepCount: t.steps.length
          })),
          correlationId
        });

      case 'template-details':
        const templateId = searchParams.get('templateId');
        if (!templateId) {
          return NextResponse.json(
            { error: 'templateId is required', correlationId },
            { status: 400 }
          );
        }

        const template = enhancedWorkflowGenerator!['workflowTemplates'].getTemplate(templateId);
        if (!template) {
          return NextResponse.json(
            { error: 'Template not found', correlationId },
            { status: 404 }
          );
        }

        return NextResponse.json({
          success: true,
          template,
          correlationId
        });

      case 'workflow-progress':
        const workflowId = searchParams.get('workflowId');
        if (!workflowId) {
          return NextResponse.json(
            { error: 'workflowId is required', correlationId },
            { status: 400 }
          );
        }

        const workflowData = activeWorkflows.get(workflowId);
        if (!workflowData) {
          return NextResponse.json(
            { error: 'Workflow not found or completed', correlationId },
            { status: 404 }
          );
        }

        return NextResponse.json({
          success: true,
          workflow: {
            id: workflowId,
            userId: workflowData.userId,
            tenantId: workflowData.tenantId,
            startTime: workflowData.startTime,
            lastProgress: workflowData.lastProgress
          },
          correlationId
        });

      case 'checkpoints':
        const checkpointWorkflowId = searchParams.get('workflowId');
        if (!checkpointWorkflowId) {
          return NextResponse.json(
            { error: 'workflowId is required', correlationId },
            { status: 400 }
          );
        }

        const checkpoints = enhancedWorkflowGenerator!['errorHandler'].getWorkflowCheckpoints(checkpointWorkflowId);
        return NextResponse.json({
          success: true,
          checkpoints: checkpoints.map(cp => ({
            id: cp.id,
            workflowId: cp.workflowId,
            stepIndex: cp.stepIndex,
            timestamp: cp.timestamp,
            completedSteps: cp.completedSteps.length,
            remainingSteps: cp.remainingSteps.length
          })),
          correlationId
        });

      case 'cost-stats':
        const llmCostStats = llmRouter!.getCostStats();
        const toolExecutionStats = toolExecutor!.getExecutionStats(userId, tenantId);
        const workflowCostStats = enhancedWorkflowGenerator!.getWorkflowCostStats();
        return NextResponse.json({
          success: true,
          llm: llmCostStats,
          tool: {
            totalToolCost: toolExecutionStats.totalDuration / 1000000 || 0,
            toolUsage: toolExecutionStats.toolUsage
          },
          workflow: workflowCostStats,
          limits: COST_LIMITS,
          correlationId
        });

      case 'cost-check':
        const currentCosts = enhancedWorkflowGenerator!.getWorkflowCostStats();
        const costCheck = {
          llm: {
            current: currentCosts.llm,
            exceeded: currentCosts.llm > COST_LIMITS.LLM_DAILY_HARD,
            warning: currentCosts.llm > COST_LIMITS.LLM_DAILY_WARNING,
            limit: COST_LIMITS.LLM_DAILY_HARD
          },
          workflow: {
            current: 0, // Per-request cost will be calculated during execution
            exceeded: false,
            warning: false,
            limit: COST_LIMITS.WORKFLOW_PER_REQUEST_HARD
          },
          total: {
            current: currentCosts.total,
            exceeded: currentCosts.total > COST_LIMITS.TOTAL_DAILY_HARD,
            warning: currentCosts.total > COST_LIMITS.TOTAL_DAILY_WARNING,
            limit: COST_LIMITS.TOTAL_DAILY_HARD
          }
        };
        return NextResponse.json({
          success: true,
          costCheck,
          correlationId
        });

      case 'reset-costs':
        enhancedWorkflowGenerator!.resetCostTracking();
        return NextResponse.json({
          success: true,
          message: 'Cost tracking reset.',
          correlationId
        });

      case 'cleanup-checkpoints':
        const hoursParam = searchParams.get('hours');
        const hours = hoursParam ? parseInt(hoursParam) : 24;
        enhancedWorkflowGenerator!['errorHandler'].cleanupCheckpoints(hours);
        return NextResponse.json({
          success: true,
          message: `Cleaned up checkpoints older than ${hours} hours.`,
          correlationId
        });

      default:
        return NextResponse.json(
          {
            error: 'Invalid action. Available actions: health, templates, template-details, workflow-progress, checkpoints, cost-stats, cost-check, reset-costs, cleanup-checkpoints',
            correlationId
          },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error(`[${correlationId}] Enhanced Agent GET failed:`, error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId
      },
      { status: 500 }
    );
  }
}
