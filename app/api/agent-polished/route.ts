import { NextRequest, NextResponse } from 'next/server';
import { RedisContextService } from '../../../services/context/RedisContextService';
import { ToolRegistry } from '../../../services/tools/ToolRegistry';
import { ToolExecutor } from '../../../services/tools/ToolExecutor';
import { SimpleIntentClassifier } from '../../../services/intelligence/SimpleIntentClassifier';
import { SimpleLLMRouter } from '../../../services/intelligence/SimpleLLMRouter';
import { EnhancedWorkflowGenerator, WorkflowProgress } from '../../../services/intelligence/EnhancedWorkflowGenerator';
import { WebSocketManager } from '../../../services/websocket/WebSocketManager';
import { ConversationManager } from '../../../services/ux/ConversationManager';

export const dynamic = 'force-dynamic';

// Initialize services (prod-safe Redis guard)
const isProd = process.env.NODE_ENV === 'production';
const redisUrl = process.env.REDIS_URL || (!isProd ? 'redis://localhost:6379' : undefined);
if (isProd && !redisUrl) {
  throw new Error('REDIS_URL must be set in production');
}
const contextService = new RedisContextService(redisUrl!);
const toolRegistry = new ToolRegistry(contextService);
const toolExecutor = new ToolExecutor(toolRegistry, contextService);
const llmRouter = new SimpleLLMRouter();
const intentClassifier = new SimpleIntentClassifier(llmRouter, toolRegistry.getAllTools().map(t => t.name));
const wsManager = new WebSocketManager(contextService);
const enhancedWorkflowGenerator = new EnhancedWorkflowGenerator(intentClassifier, llmRouter, toolExecutor, contextService, wsManager);
const conversationManager = new ConversationManager(contextService);

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
  const correlationId = contextService.generateCorrelationId();
  console.log(`[${correlationId}] Polished Agent request received`);

  try {
    const body = await request.json();
    const {
      message,
      userId = 'test-user',
      tenantId = 'default',
      useTemplates = true,
      requireApproval = false,
      resumeWorkflow = null,
      provideFeedback = null // { turnId, rating, helpful, issues?, suggestions? }
    } = body;

    // Handle feedback submission
    if (provideFeedback) {
      const success = await conversationManager.addFeedback(
        provideFeedback.turnId,
        {
          rating: provideFeedback.rating,
          helpful: provideFeedback.helpful,
          issues: provideFeedback.issues,
          suggestions: provideFeedback.suggestions
        }
      );

      return NextResponse.json({
        success,
        message: success ? 'Thank you for your feedback!' : 'Feedback submission failed',
        correlationId
      });
    }

    if (!message && !resumeWorkflow) {
      return NextResponse.json(
        { error: 'Message or resumeWorkflow is required', correlationId },
        { status: 400 }
      );
    }

    // Start conversation turn
    let conversationTurn;
    if (message) {
      conversationTurn = await conversationManager.startConversationTurn(
        userId,
        tenantId,
        message,
        correlationId
      );
    }

    // Get conversation context for better responses
    const conversationContext = await conversationManager.getRecentContext(userId, tenantId);

    // Check cost limits
    const currentCosts = enhancedWorkflowGenerator.getWorkflowCostStats();
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
      const errorResponse = conversationManager.formatErrorWithRecovery(
        { code: 'COST_LIMIT_EXCEEDED' },
        { userMessage: message || '', attemptedAction: 'workflow_execution', userId, tenantId }
      );

      if (conversationTurn) {
        await conversationManager.completeConversationTurn(
          conversationTurn.id,
          errorResponse.message,
          undefined,
          undefined,
          'failed'
        );
      }

      return NextResponse.json({
        success: false,
        message: errorResponse.message,
        recoveryOptions: errorResponse.recoveryOptions,
        suggestions: errorResponse.suggestions,
        costCheck,
        correlationId
      }, { status: 429 });
    }

    let workflowResult;

    if (resumeWorkflow) {
      // Resume existing workflow
      console.log(`[${correlationId}] Resuming workflow: ${resumeWorkflow.workflowId}`);
      workflowResult = await enhancedWorkflowGenerator.resumeWorkflow(
        resumeWorkflow.workflowId,
        resumeWorkflow.checkpointId,
        correlationId,
        resumeWorkflow.recoveryAction
      );
    } else {
      // Enhanced progress callback with conversation awareness
      const progressCallback = (progress: WorkflowProgress) => {
        console.log(`[${correlationId}] Workflow progress:`, progress);

        // Generate user-friendly progress message
        const progressMessage = conversationManager.generateProgressResponse(
          progress,
          conversationContext.userPreferences
        );

        // Broadcast progress via WebSocket
        wsManager.sendToUser(userId, tenantId, {
          type: 'workflow_progress',
          payload: {
            workflowId: `workflow_${correlationId}`,
            progress: {
              ...progress,
              userFriendlyMessage: progressMessage
            }
          },
          timestamp: new Date(),
          correlationId
        });
      };

      // Execute new workflow
      workflowResult = await enhancedWorkflowGenerator.generateAndExecuteWorkflow(
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
    }

    // Update cost check after execution
    costCheck.workflow.exceeded = workflowResult.cost.total > COST_LIMITS.WORKFLOW_PER_REQUEST_HARD;
    costCheck.workflow.warning = workflowResult.cost.total > COST_LIMITS.WORKFLOW_PER_REQUEST_WARNING;

    if (costCheck.workflow.exceeded) {
      const errorResponse = conversationManager.formatErrorWithRecovery(
        { code: 'WORKFLOW_COST_EXCEEDED' },
        { userMessage: message || '', attemptedAction: 'workflow_execution', userId, tenantId }
      );

      if (conversationTurn) {
        await conversationManager.completeConversationTurn(
          conversationTurn.id,
          errorResponse.message,
          workflowResult.intent,
          workflowResult,
          'failed'
        );
      }

      return NextResponse.json({
        success: false,
        message: errorResponse.message,
        recoveryOptions: errorResponse.recoveryOptions,
        suggestions: errorResponse.suggestions,
        costCheck,
        correlationId
      }, { status: 429 });
    }

    // Generate contextual suggestions for next actions
    const suggestions = await conversationManager.generateResponseSuggestions(
      userId,
      tenantId,
      workflowResult.intent?.primary_intent
    );

    // Complete conversation turn
    if (conversationTurn) {
      await conversationManager.completeConversationTurn(
        conversationTurn.id,
        workflowResult.message,
        workflowResult.intent,
        workflowResult,
        workflowResult.status
      );
    }

    // Enhanced response with UX improvements
    const response = {
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
      suggestions,
      conversationTurn: conversationTurn?.id,
      showCostInfo: conversationContext.userPreferences?.communicationPreferences?.showCostInfo !== false,
      correlationId
    };

    // Send completion notification via WebSocket
    if (workflowResult.status === 'completed') {
      wsManager.sendToUser(userId, tenantId, {
        type: 'workflow_complete',
        payload: {
          workflowId: `workflow_${correlationId}`,
          result: workflowResult,
          suggestions
        },
        timestamp: new Date(),
        correlationId
      });
    } else if (workflowResult.status === 'failed' || workflowResult.status === 'partial') {
      wsManager.sendToUser(userId, tenantId, {
        type: 'workflow_error',
        payload: {
          workflowId: `workflow_${correlationId}`,
          error: workflowResult,
          recoveryOptions: workflowResult.recoveryOptions
        },
        timestamp: new Date(),
        correlationId
      });
    }

    console.log(`[${correlationId}] Polished Agent response generated. Status: ${workflowResult.status}`);
    return NextResponse.json(response);

  } catch (error) {
    console.error(`[${correlationId}] Polished Agent POST failed:`, error);

    // Format error with recovery options
    const errorResponse = conversationManager.formatErrorWithRecovery(
      { code: 'SYSTEM_ERROR', message: error instanceof Error ? error.message : 'Unknown error' },
      { userMessage: '', attemptedAction: 'system_operation', userId: 'unknown', tenantId: 'default' }
    );

    return NextResponse.json({
      success: false,
      message: errorResponse.message,
      recoveryOptions: errorResponse.recoveryOptions,
      suggestions: errorResponse.suggestions,
      error: error instanceof Error ? error.message : 'Unknown error',
      correlationId
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const correlationId = contextService.generateCorrelationId();
  console.log(`[${correlationId}] Polished Agent GET request received`);

  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const userId = searchParams.get('userId') || 'test-user';
    const tenantId = searchParams.get('tenantId') || 'default';

    switch (action) {
      case 'health':
        const contextHealth = await contextService.checkHealth();
        const providerHealth = await llmRouter.checkProviderHealth();
        const wsStats = wsManager.getStats();
        const conversationAnalytics = conversationManager.getAnalytics();

        return NextResponse.json({
          success: true,
          service: 'agent-polished',
          timestamp: new Date().toISOString(),
          context: contextHealth,
          llmProviders: providerHealth,
          websocket: wsStats,
          conversations: conversationAnalytics,
          correlationId
        });

      case 'conversation-history':
        const limit = parseInt(searchParams.get('limit') || '10');
        const history = await conversationManager.getConversationHistory(userId, tenantId, limit);

        return NextResponse.json({
          success: true,
          history,
          correlationId
        });

      case 'conversation-context':
        const lookback = parseInt(searchParams.get('lookback') || '3');
        const context = await conversationManager.getRecentContext(userId, tenantId, lookback);

        return NextResponse.json({
          success: true,
          context,
          correlationId
        });

      case 'suggestions':
        const currentIntent = searchParams.get('intent');
        const suggestions = await conversationManager.generateResponseSuggestions(
          userId,
          tenantId,
          currentIntent || undefined
        );

        return NextResponse.json({
          success: true,
          suggestions,
          correlationId
        });

      case 'preferences':
        const userHistory = await conversationManager.getConversationHistory(userId, tenantId, 1);
        const preferences = userHistory?.preferences;

        return NextResponse.json({
          success: true,
          preferences: preferences || {
            preferredResponseStyle: 'detailed',
            defaultApprovalRequired: false,
            preferredTemplates: [],
            communicationPreferences: {
              showProgress: true,
              showTechnicalDetails: false,
              showCostInfo: false
            }
          },
          correlationId
        });

      case 'analytics':
        const analytics = conversationManager.getAnalytics(userId, tenantId);

        return NextResponse.json({
          success: true,
          analytics,
          correlationId
        });

      case 'cleanup-conversations':
        const days = parseInt(searchParams.get('days') || '30');
        const cleanedCount = conversationManager.cleanupOldConversations(days);

        return NextResponse.json({
          success: true,
          message: `Cleaned up ${cleanedCount} old conversations`,
          cleanedCount,
          correlationId
        });

      default:
        // Inherit all enhanced agent functionality
        return NextResponse.json(
          {
            error: 'Invalid action. Available actions: health, conversation-history, conversation-context, suggestions, preferences, analytics, cleanup-conversations',
            correlationId
          },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error(`[${correlationId}] Polished Agent GET failed:`, error);
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

export async function PUT(request: NextRequest) {
  const correlationId = contextService.generateCorrelationId();
  console.log(`[${correlationId}] Polished Agent PUT request received`);

  try {
    const body = await request.json();
    const { action, userId = 'test-user', tenantId = 'default', ...params } = body;

    switch (action) {
      case 'update-preferences':
        await conversationManager.updateUserPreferences(userId, tenantId, params);

        return NextResponse.json({
          success: true,
          message: 'User preferences updated',
          correlationId
        });

      default:
        return NextResponse.json(
          {
            error: 'Invalid action. Available actions: update-preferences',
            correlationId
          },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error(`[${correlationId}] Polished Agent PUT failed:`, error);
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
