import { NextRequest, NextResponse } from 'next/server';
import { ToolRegistry } from '../../../../services/tools/ToolRegistry';
import { ToolExecutor } from '../../../../services/tools/ToolExecutor';
import { RedisContextService } from '../../../../services/context/RedisContextService';

// Initialize services
const contextService = new RedisContextService(process.env.REDIS_URL || 'redis://localhost:6379');
const toolRegistry = new ToolRegistry(contextService);
const toolExecutor = new ToolExecutor(toolRegistry, contextService);

// Initialize common chains
toolExecutor.initializeCommonChains();

export async function POST(request: NextRequest) {
  const correlationId = contextService.generateCorrelationId();

  try {
    const body = await request.json();
    const { toolName, parameters, userId = 'test-user', tenantId = 'default' } = body;

    console.log(`[${correlationId}] POST /api/tools/test - toolName: ${toolName}, userId: ${userId}`);

    if (!toolName) {
      return NextResponse.json(
        { error: 'toolName is required', correlationId },
        { status: 400 }
      );
    }

    // Execute the tool
    const execution = await toolExecutor.executeTool(
      toolName,
      parameters || {},
      { userId, tenantId }
    );

    console.log(`[${correlationId}] Tool execution completed: ${execution.status}`);

    return NextResponse.json({
      success: true,
      execution,
      correlationId
    });

  } catch (error) {
    console.error(`[${correlationId}] Tool test execution failed:`, error);
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
  if (process.env.NODE_ENV === 'production' && !process.env.ENABLE_DEBUG_ENDPOINTS) {
    return NextResponse.json({ error: 'Disabled in production' }, { status: 404 });
  }
  const correlationId = contextService.generateCorrelationId();

  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const userId = searchParams.get('userId') || 'test-user';
    const tenantId = searchParams.get('tenantId') || 'default';

    console.log(`[${correlationId}] GET /api/tools/test - action: ${action}, userId: ${userId}`);

    switch (action) {
      case 'list':
        const tools = toolRegistry.getAllTools();
        return NextResponse.json({
          success: true,
          tools: tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            category: tool.category,
            requiresContext: tool.requiresContext
          })),
          correlationId
        });

      case 'stats':
        const toolStats = await toolRegistry.getToolStats();
        const executionStats = toolExecutor.getExecutionStats(userId, tenantId);
        return NextResponse.json({
          success: true,
          toolStats,
          executionStats,
          correlationId
        });

      case 'history':
        const limit = parseInt(searchParams.get('limit') || '20');
        const history = toolExecutor.getExecutionHistory(userId, tenantId, limit);
        return NextResponse.json({
          success: true,
          history,
          correlationId
        });

      case 'health':
        const contextHealth = await contextService.checkHealth();
        return NextResponse.json({
          success: true,
          service: 'tools-test',
          timestamp: new Date().toISOString(),
          context: contextHealth,
          correlationId
        });

      default:
        return NextResponse.json(
          {
            error: 'Invalid action. Use: list, stats, history, or health',
            correlationId
          },
          { status: 400 }
        );
    }

  } catch (error) {
    console.error(`[${correlationId}] Tool test GET failed:`, error);
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

// Test tool chain execution
export async function PUT(request: NextRequest) {
  const correlationId = contextService.generateCorrelationId();

  try {
    const body = await request.json();
    const { chainId, userId = 'test-user', tenantId = 'default' } = body;

    console.log(`[${correlationId}] PUT /api/tools/test - chainId: ${chainId}, userId: ${userId}`);

    if (!chainId) {
      return NextResponse.json(
        { error: 'chainId is required', correlationId },
        { status: 400 }
      );
    }

    // Execute the tool chain
    const executions = await toolExecutor.executeChain(
      chainId,
      { userId, tenantId }
    );

    console.log(`[${correlationId}] Tool chain execution completed: ${executions.length} steps`);

    return NextResponse.json({
      success: true,
      chainId,
      executions,
      correlationId
    });

  } catch (error) {
    console.error(`[${correlationId}] Tool chain test execution failed:`, error);
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
