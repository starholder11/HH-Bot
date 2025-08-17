import { NextRequest, NextResponse } from 'next/server';
import { SimpleIntentClassifier } from '../../../services/intelligence/SimpleIntentClassifier';
import { ToolRegistry } from '../../../services/tools/ToolRegistry';
import { ToolExecutor } from '../../../services/tools/ToolExecutor';
import { RedisContextService } from '../../../services/context/RedisContextService';

// Initialize services
const contextService = new RedisContextService(process.env.REDIS_URL || 'redis://localhost:6379');
const toolRegistry = new ToolRegistry(contextService);
const toolExecutor = new ToolExecutor(toolRegistry, contextService);

// Initialize intent classifier with available tools
const availableTools = toolRegistry.getAllTools().map(t => t.name);
const intentClassifier = new SimpleIntentClassifier(availableTools);

export async function POST(request: NextRequest) {
  const correlationId = contextService.generateCorrelationId();

  try {
    const body = await request.json();
    const { message, userId = 'test-user', tenantId = 'default' } = body;

    console.log(`[${correlationId}] POST /api/agent-simple - message: "${message}", userId: ${userId}`);

    if (!message) {
      return NextResponse.json(
        { error: 'message is required', correlationId },
        { status: 400 }
      );
    }

    // Classify the intent
    const result = await intentClassifier.classifyIntent(message, { userId });
    const intent = result.intent;

    console.log(`[${correlationId}] Intent: ${intent.intent}, Tool: ${intent.tool_name}, Confidence: ${intent.confidence}`);

    // Execute the recommended tool
    const execution = await toolExecutor.executeTool(
      intent.tool_name,
      intent.parameters,
      { userId, tenantId }
    );

    console.log(`[${correlationId}] Tool execution: ${execution.status}`);

    // Generate response message
    let responseMessage = '';
    if (execution.status === 'completed') {
      switch (intent.intent) {
        case 'search':
          responseMessage = `I searched for "${intent.parameters.query}" and found results.`;
          break;
        case 'create':
          responseMessage = `I created a new ${intent.tool_name.replace('create', '').toLowerCase()} for you.`;
          break;
        case 'update':
          responseMessage = `I updated the item as requested.`;
          break;
        case 'chat':
          responseMessage = execution.result?.response || 'Hello! How can I help you?';
          break;
        default:
          responseMessage = 'Task completed successfully.';
      }
    } else {
      responseMessage = `I encountered an issue: ${execution.error}`;
    }

    return NextResponse.json({
      success: execution.status === 'completed',
      message: responseMessage,
      intent: {
        classification: intent.intent,
        confidence: intent.confidence,
        reasoning: intent.reasoning
      },
      execution: {
        tool: intent.tool_name,
        status: execution.status,
        duration: execution.duration,
        error: execution.error
      },
      correlationId
    });

  } catch (error) {
    console.error(`[${correlationId}] Simple agent processing failed:`, error);
    return NextResponse.json(
      {
        success: false,
        message: `I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        correlationId
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === 'production' && !process.env.ENABLE_DEBUG_ENDPOINTS) {
    return NextResponse.json({ error: 'Disabled in production' }, { status: 404 });
  }
  const correlationId = contextService.generateCorrelationId();

  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    switch (action) {
      case 'stats':
        const costStats = intentClassifier.getCostStats();
        const toolStats = await toolRegistry.getToolStats();
        return NextResponse.json({
          success: true,
          stats: {
            intent: costStats,
            tools: toolStats,
            availableTools: availableTools.length
          },
          correlationId
        });

      case 'health':
        return NextResponse.json({
          success: true,
          service: 'agent-simple',
          timestamp: new Date().toISOString(),
          status: 'healthy',
          availableTools: availableTools.length,
          correlationId
        });

      default:
        return NextResponse.json(
          {
            error: 'Invalid action. Use: stats or health',
            correlationId
          },
          { status: 400 }
        );
    }

  } catch (error) {
    console.error(`[${correlationId}] Simple agent GET failed:`, error);
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
