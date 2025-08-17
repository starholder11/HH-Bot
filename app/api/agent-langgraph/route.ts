import { NextRequest, NextResponse } from 'next/server';
import { RedisContextService } from '../../../services/context/RedisContextService';
import { ToolRegistry } from '../../../services/tools/ToolRegistry';
import { ToolExecutor } from '../../../services/tools/ToolExecutor';
import { QualityController } from '../../../services/quality/QualityController';
import { LangGraphOrchestrator } from '../../../services/orchestration/LangGraphOrchestrator';
import { ConversationManager } from '../../../services/ux/ConversationManager';
import { WebSocketManager } from '../../../services/websocket/WebSocketManager';

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
const qualityController = new QualityController(contextService);
const conversationManager = new ConversationManager(contextService);
const wsManager = new WebSocketManager(contextService);

// Initialize LangGraph orchestrator
const langGraphOrchestrator = new LangGraphOrchestrator(
  toolExecutor,
  toolRegistry,
  contextService,
  qualityController
);

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
  console.log(`[${correlationId}] LangGraph Agent request received`);

  try {
    const body = await request.json();
    const {
      message,
      userId = 'test-user',
      tenantId = 'default',
      workflowType = 'general',
      context = {}
    } = body;

    if (!message) {
      return NextResponse.json(
        { error: 'Message is required', correlationId },
        { status: 400 }
      );
    }

    // Start conversation turn
    const conversationTurn = await conversationManager.startConversationTurn(
      userId,
      tenantId,
      message,
      correlationId
    );

    // Get conversation context
    const conversationContext = await conversationManager.getRecentContext(userId, tenantId);

    // Set up progress callback for WebSocket updates
    const progressCallback = (step: string, current: number, total: number) => {
      wsManager.sendToUser(userId, tenantId, {
        type: 'workflow_progress',
        payload: {
          workflowId: `langgraph_${correlationId}`,
          step,
          current,
          total,
          message: `Step ${current}/${total}: ${step}`
        },
        timestamp: new Date(),
        correlationId
      });
    };

    // Pre-flight cost limits (align with comprehensive agent)
    const currentCosts = { llm: 0, total: 0 }; // Placeholder; wire to router/workflow stats if available
    const preCheck = {
      llm: { exceeded: false, warning: false },
      total: { exceeded: false, warning: false }
    };
    if (preCheck.llm.exceeded || preCheck.total.exceeded) {
      return NextResponse.json(
        { success: false, message: 'Daily cost limit exceeded', correlationId },
        { status: 429 }
      );
    }

    // Execute workflow using LangGraph
    console.log(`[${correlationId}] Executing LangGraph workflow`);
    const workflowResult = await langGraphOrchestrator.executeWorkflow(
      message,
      userId,
      tenantId,
      correlationId,
      workflowType,
      { ...context, conversationContext }
    );

    // Extract final message from LangGraph state
    const finalMessages = workflowResult.finalState.messages;
    const lastMessage = finalMessages[finalMessages.length - 1];
    const responseMessage = lastMessage?.content || 'Workflow completed';

    // Complete conversation turn
    await conversationManager.completeConversationTurn(
      conversationTurn.id,
      responseMessage as string,
      workflowResult.finalState.context?.intent,
      {
        executionPath: workflowResult.executionPath,
        toolResults: workflowResult.finalState.toolResults,
        qualityScore: workflowResult.qualityScore
      },
      workflowResult.success ? 'completed' : 'failed'
    );

    // Generate contextual suggestions
    const suggestions = await conversationManager.generateResponseSuggestions(
      userId,
      tenantId,
      workflowResult.finalState.context?.intent?.primary_intent
    );

    // Send completion notification via WebSocket
    if (workflowResult.success) {
      wsManager.sendToUser(userId, tenantId, {
        type: 'workflow_complete',
        payload: {
          workflowId: `langgraph_${correlationId}`,
          result: workflowResult,
          suggestions
        },
        timestamp: new Date(),
        correlationId
      });
    } else {
      wsManager.sendToUser(userId, tenantId, {
        type: 'workflow_error',
        payload: {
          workflowId: `langgraph_${correlationId}`,
          errors: workflowResult.errors,
          finalState: workflowResult.finalState
        },
        timestamp: new Date(),
        correlationId
      });
    }

    console.log(`[${correlationId}] LangGraph workflow completed. Success: ${workflowResult.success}, Duration: ${workflowResult.duration}ms`);

    // Post-execution per-workflow cost check (placeholder; integrate actual cost aggregation when available)
    const workflowCost = 0; // compute from workflowResult if tracked
    const costCheck = {
      workflow: {
        exceeded: workflowCost > COST_LIMITS.WORKFLOW_PER_REQUEST_HARD,
        warning: workflowCost > COST_LIMITS.WORKFLOW_PER_REQUEST_WARNING
      }
    } as any;
    if (costCheck.workflow.exceeded) {
      return NextResponse.json(
        { success: false, message: 'Per-workflow cost limit exceeded', correlationId },
        { status: 429 }
      );
    }

    return NextResponse.json({
      success: workflowResult.success,
      message: responseMessage,
      intent: workflowResult.finalState.context?.intent,
      executionPath: workflowResult.executionPath,
      toolResults: workflowResult.finalState.toolResults,
      qualityScore: workflowResult.qualityScore,
      duration: workflowResult.duration,
      totalSteps: workflowResult.totalSteps,
      errors: workflowResult.errors,
      costCheck,
      suggestions,
      conversationTurn: conversationTurn.id,
      orchestrator: 'LangGraph',
      correlationId
    });

  } catch (error) {
    console.error(`[${correlationId}] LangGraph Agent POST failed:`, error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        orchestrator: 'LangGraph',
        correlationId
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const correlationId = contextService.generateCorrelationId();
  console.log(`[${correlationId}] LangGraph Agent GET request received`);

  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const userId = searchParams.get('userId') || 'test-user';
    const tenantId = searchParams.get('tenantId') || 'default';

    switch (action) {
      case 'health':
        const contextHealth = await contextService.checkHealth();
        const wsStats = wsManager.getStats();
        const workflowStats = langGraphOrchestrator.getWorkflowStats();
        const conversationAnalytics = conversationManager.getAnalytics();

        return NextResponse.json({
          success: true,
          service: 'agent-langgraph',
          timestamp: new Date().toISOString(),
          context: contextHealth,
          websocket: wsStats,
          workflows: workflowStats,
          conversations: conversationAnalytics,
          orchestrator: 'LangGraph',
          correlationId
        });

      case 'tools':
        const allTools = toolRegistry.getAllTools();
        return NextResponse.json({
          success: true,
          tools: allTools.map(tool => ({
            name: tool.name,
            category: tool.category || 'general',
            description: `Execute ${tool.name} operation`
          })),
          totalTools: allTools.length,
          correlationId
        });

      case 'workflow-stats':
        const stats = langGraphOrchestrator.getWorkflowStats();
        return NextResponse.json({
          success: true,
          stats,
          correlationId
        });

      case 'demo-langgraph':
        // Demo LangGraph workflow execution
        const demoMessage = "Create a cyberpunk image gallery with 5 images";

        console.log(`[${correlationId}] Running LangGraph demo workflow`);
        const demoResult = await langGraphOrchestrator.executeWorkflow(
          demoMessage,
          userId,
          tenantId,
          correlationId,
          'create_gallery',
          { demo: true }
        );

        return NextResponse.json({
          success: true,
          demo: {
            message: demoMessage,
            result: demoResult,
            orchestrator: 'LangGraph'
          },
          correlationId
        });

      default:
        return NextResponse.json(
          {
            error: 'Invalid action. Available actions: health, tools, workflow-stats, demo-langgraph',
            correlationId
          },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error(`[${correlationId}] LangGraph Agent GET failed:`, error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        orchestrator: 'LangGraph',
        correlationId
      },
      { status: 500 }
    );
  }
}
