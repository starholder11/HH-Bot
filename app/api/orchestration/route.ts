import { NextRequest, NextResponse } from 'next/server';
import { RedisContextService } from '../../../services/context/RedisContextService';
import { ToolExecutor } from '../../../services/tools/ToolExecutor';
import { ToolRegistry } from '../../../services/tools/ToolRegistry';
import { QualityController } from '../../../services/quality/QualityController';
import { ConversationManager } from '../../../services/ux/ConversationManager';
import { AdvancedOrchestrator } from '../../../services/orchestration/AdvancedOrchestrator';

export const dynamic = 'force-dynamic';

// Initialize services
const contextService = new RedisContextService(process.env.REDIS_URL || 'redis://localhost:6379');
const toolRegistry = new ToolRegistry(contextService);
const toolExecutor = new ToolExecutor(toolRegistry, contextService);
const qualityController = new QualityController(contextService);
const conversationManager = new ConversationManager(contextService);
const advancedOrchestrator = new AdvancedOrchestrator(
  contextService,
  toolExecutor,
  qualityController,
  conversationManager
);

export async function POST(request: NextRequest) {
  const correlationId = contextService.generateCorrelationId();
  console.log(`[${correlationId}] Advanced Orchestration request received`);

  try {
    const body = await request.json();
    const {
      action,
      userId = 'test-user',
      tenantId = 'default',
      ...params
    } = body;

    switch (action) {
      case 'execute-optimized':
        const { workflowType, steps, context } = params;

        if (!workflowType || !steps) {
          return NextResponse.json(
            { error: 'workflowType and steps are required', correlationId },
            { status: 400 }
          );
        }

        const result = await advancedOrchestrator.executeOptimizedWorkflow(
          workflowType,
          steps,
          { ...context, userId, tenantId },
          userId,
          tenantId,
          correlationId
        );

        return NextResponse.json({
          success: true,
          result,
          correlationId
        });

      case 'learn-patterns':
        const { intent, workflow, context: learningContext } = params;

        if (!intent || !workflow) {
          return NextResponse.json(
            { error: 'intent and workflow are required', correlationId },
            { status: 400 }
          );
        }

        await advancedOrchestrator.learnUserPatterns(
          userId,
          tenantId,
          intent,
          workflow,
          learningContext || {}
        );

        return NextResponse.json({
          success: true,
          message: 'User patterns updated',
          correlationId
        });

      case 'optimize-resources':
        const { pendingWorkflows } = params;

        if (!pendingWorkflows || !Array.isArray(pendingWorkflows)) {
          return NextResponse.json(
            { error: 'pendingWorkflows array is required', correlationId },
            { status: 400 }
          );
        }

        const optimization = await advancedOrchestrator.optimizeResourceAllocation(pendingWorkflows);

        return NextResponse.json({
          success: true,
          optimization,
          correlationId
        });

      default:
        return NextResponse.json(
          {
            error: 'Invalid action. Available actions: execute-optimized, learn-patterns, optimize-resources',
            correlationId
          },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error(`[${correlationId}] Advanced Orchestration POST failed:`, error);
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
  console.log(`[${correlationId}] Advanced Orchestration GET request received`);

  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const userId = searchParams.get('userId') || 'test-user';
    const tenantId = searchParams.get('tenantId') || 'default';

    switch (action) {
      case 'health':
        const contextHealth = await contextService.checkHealth();
        const optimizationStats = advancedOrchestrator.getOptimizationStats();
        const cacheStats = advancedOrchestrator.getCacheStats();

        return NextResponse.json({
          success: true,
          service: 'advanced-orchestration',
          timestamp: new Date().toISOString(),
          context: contextHealth,
          optimization: optimizationStats,
          cache: cacheStats,
          correlationId
        });

      case 'predictions':
        const currentContext = searchParams.get('context') ?
          JSON.parse(searchParams.get('context')!) : undefined;

        const predictions = await advancedOrchestrator.getPredictiveSuggestions(
          userId,
          tenantId,
          currentContext
        );

        return NextResponse.json({
          success: true,
          predictions,
          correlationId
        });

      case 'optimization-stats':
        const stats = advancedOrchestrator.getOptimizationStats();
        return NextResponse.json({
          success: true,
          stats,
          correlationId
        });

      case 'cache-stats':
        const cacheStatsDetailed = advancedOrchestrator.getCacheStats();
        return NextResponse.json({
          success: true,
          cache: cacheStatsDetailed,
          correlationId
        });

      case 'demo-optimization':
        // Demo optimized workflow execution
        const demoSteps = [
          {
            name: 'search',
            toolName: 'searchUnified',
            parameters: { query: 'cyberpunk art', type: 'image', limit: 5 },
            type: 'api_call'
          },
          {
            name: 'createCanvas',
            toolName: 'createCanvas',
            parameters: { name: 'Cyberpunk Gallery' },
            type: 'api_call'
          },
          {
            name: 'pinItems',
            toolName: 'pinMultipleToCanvas',
            parameters: { canvasId: '{{createCanvas.result.id}}', items: '{{search.result.items}}' },
            type: 'api_call'
          }
        ];

        const demoContext = {
          query: 'cyberpunk art',
          queryFrequency: 5, // Frequent query to trigger caching
          searchResultCount: 5,
          canvasName: null,
          userId,
          tenantId
        };

        const demoResult = await advancedOrchestrator.executeOptimizedWorkflow(
          'search-and-create',
          demoSteps,
          demoContext,
          userId,
          tenantId,
          correlationId
        );

        return NextResponse.json({
          success: true,
          demo: demoResult,
          message: 'Demo optimization completed',
          correlationId
        });

      case 'demo-resource-optimization':
        // Demo resource optimization
        const demoPendingWorkflows = [
          {
            id: 'workflow-1',
            type: 'search_create_canvas',
            priority: 8,
            estimatedResources: { cpu: 20, memory: 30, network: 15 },
            userId: 'user-1',
            tenantId: 'default'
          },
          {
            id: 'workflow-2',
            type: 'batch_media_processing',
            priority: 6,
            estimatedResources: { cpu: 60, memory: 40, network: 25 },
            userId: 'user-2',
            tenantId: 'default'
          },
          {
            id: 'workflow-3',
            type: 'content_analysis',
            priority: 9,
            estimatedResources: { cpu: 30, memory: 50, network: 10 },
            userId: 'user-1',
            tenantId: 'default'
          },
          {
            id: 'workflow-4',
            type: 'search_create_canvas',
            priority: 7,
            estimatedResources: { cpu: 15, memory: 20, network: 12 },
            userId: 'user-3',
            tenantId: 'default'
          }
        ];

        const demoOptimization = await advancedOrchestrator.optimizeResourceAllocation(demoPendingWorkflows);

        return NextResponse.json({
          success: true,
          demo: demoOptimization,
          message: 'Demo resource optimization completed',
          correlationId
        });

      case 'demo-pattern-learning':
        // Demo pattern learning
        await advancedOrchestrator.learnUserPatterns(
          userId,
          tenantId,
          'create_gallery',
          'search_create_canvas',
          { query: 'cyberpunk art', timeOfDay: 'afternoon' }
        );

        await advancedOrchestrator.learnUserPatterns(
          userId,
          tenantId,
          'create_gallery',
          'search_create_canvas',
          { query: 'digital art', timeOfDay: 'afternoon' }
        );

        await advancedOrchestrator.learnUserPatterns(
          userId,
          tenantId,
          'analyze_content',
          'content_analysis',
          { scope: 'recent uploads', timeOfDay: 'morning' }
        );

        const learnedPredictions = await advancedOrchestrator.getPredictiveSuggestions(userId, tenantId);

        return NextResponse.json({
          success: true,
          demo: {
            patternsLearned: 3,
            predictions: learnedPredictions
          },
          message: 'Demo pattern learning completed',
          correlationId
        });

      default:
        return NextResponse.json(
          {
            error: 'Invalid action. Available actions: health, predictions, optimization-stats, cache-stats, demo-optimization, demo-resource-optimization, demo-pattern-learning',
            correlationId
          },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error(`[${correlationId}] Advanced Orchestration GET failed:`, error);
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
