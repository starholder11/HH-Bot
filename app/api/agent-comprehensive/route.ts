import { NextRequest, NextResponse } from 'next/server';
import { SimpleWorkflowGenerator } from '../../../services/intelligence/SimpleWorkflowGenerator';
import { SimpleIntentClassifier } from '../../../services/intelligence/SimpleIntentClassifier';
import { UniversalToolRegistry } from '../../../services/tools/UniversalToolRegistry';
import { ToolExecutor } from '../../../services/tools/ToolExecutor';
import { RedisContextService } from '../../../services/context/RedisContextService';

// Lazy service initialization to avoid build-time Redis connection
let contextService: RedisContextService | null = null;
let universalRegistry: UniversalToolRegistry | null = null;
let toolExecutor: ToolExecutor | null = null;
let intentClassifier: SimpleIntentClassifier | null = null;
let workflowGenerator: SimpleWorkflowGenerator | null = null;

async function initializeServices() {
  if (!contextService) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    contextService = new RedisContextService(redisUrl);

    universalRegistry = new UniversalToolRegistry(
      contextService,
      process.env.LANCEDB_API_URL || 'http://localhost:3000',
      process.cwd()
    );
    await universalRegistry.initializeAllTools();

    toolExecutor = new ToolExecutor(universalRegistry, contextService);
    // Intent classifier is encapsulated inside the workflow generator path when using processNaturalLanguageRequest
    intentClassifier = new SimpleIntentClassifier(undefined, universalRegistry.getToolNames());
    workflowGenerator = new SimpleWorkflowGenerator(universalRegistry as any, toolExecutor, contextService);
  }
  return { contextService, universalRegistry, toolExecutor, intentClassifier, workflowGenerator };
}

export async function POST(request: NextRequest) {
  const { contextService, workflowGenerator } = await initializeServices();
  const correlationId = contextService!.generateCorrelationId();

  try {
    const body = await request.json();
    const { message, userId = 'test-user', tenantId = 'default' } = body;

    console.log(`[${correlationId}] POST /api/agent-comprehensive - message: "${message}", userId: ${userId}`);

    if (!message) {
      return NextResponse.json(
        { error: 'message is required', correlationId },
        { status: 400 }
      );
    }

    // End-to-end processing (classification + execution)
    const result = await workflowGenerator!.processNaturalLanguageRequest(
      message,
      userId,
      tenantId
    );

    console.log(`[${correlationId}] Workflow execution: ${result.status}`);
    console.log(`[${correlationId}] Backend response structure:`, JSON.stringify({
      success: result.success,
      execution: !!result.execution,
      intent: !!result.execution?.intent,
      workflow_steps: result.execution?.intent?.workflow_steps?.length || 0,
      intent_keys: result.execution?.intent ? Object.keys(result.execution.intent) : []
    }));

    return NextResponse.json({
      success: result.success,
      message: result.message,
      execution: result.execution,
      cost: result.cost,
      correlationId
    });

  } catch (error) {
    console.error(`[${correlationId}] Comprehensive agent processing failed:`, error);
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
  const { contextService } = initializeServices();
  const correlationId = contextService!.generateCorrelationId();

  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const userId = searchParams.get('userId');

    console.log(`[${correlationId}] GET /api/agent-comprehensive - action: ${action}, userId: ${userId}`);

    switch (action) {
      case 'stats':
        const stats = workflowGenerator!.getUsageStats();
        return NextResponse.json({
          success: true,
          stats,
          correlationId
        });

      case 'workflows':
        const workflows = workflowGenerator!.getActiveWorkflows(userId || undefined);
        return NextResponse.json({
          success: true,
          workflows: workflows.map(w => ({
            id: w.id,
            intent: w.intent.intent,
            confidence: w.intent.confidence,
            status: w.status,
            costs: {
              total: w.totalCost,
              llm: w.llmCost,
              tool: w.toolCost
            },
            duration: w.startTime && w.endTime ? w.endTime - w.startTime : undefined,
            error: w.error
          })),
          correlationId
        });

      case 'cost-check':
        const dailyLimit = parseFloat(searchParams.get('dailyLimit') || '10');
        const monthlyLimit = parseFloat(searchParams.get('monthlyLimit') || '100');
        const costLimits = workflowGenerator!.checkCostLimits(dailyLimit, monthlyLimit);
        return NextResponse.json({
          success: true,
          costLimits,
          correlationId
        });

      case 'provider-health':
        const providerHealth = await workflowGenerator!.checkProviderHealth();
        return NextResponse.json({
          success: true,
          providerHealth,
          correlationId
        });

      case 'health':
        const usageStats = workflowGenerator!.getUsageStats();
        const health = await workflowGenerator!.checkProviderHealth();
        return NextResponse.json({
          success: true,
          service: 'agent-comprehensive',
          timestamp: new Date().toISOString(),
          providers: health,
          workflows: usageStats.workflows,
          costs: {
            llm: usageStats.llm,
            workflows: usageStats.workflows.totalCost
          },
          correlationId
        });

      default:
        return NextResponse.json(
          {
            error: 'Invalid action. Use: stats, workflows, cost-check, provider-health, or health',
            correlationId
          },
          { status: 400 }
        );
    }

  } catch (error) {
    console.error(`[${correlationId}] Comprehensive agent GET failed:`, error);
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

// Reset usage statistics
export async function DELETE(request: NextRequest) {
  const correlationId = contextService!.generateCorrelationId();

  try {
    console.log(`[${correlationId}] DELETE /api/agent-comprehensive - Resetting usage stats`);

    workflowGenerator!.resetUsageStats();

    return NextResponse.json({
      success: true,
      message: 'Usage statistics reset successfully',
      correlationId
    });

  } catch (error) {
    console.error(`[${correlationId}] Reset usage stats failed:`, error);
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
