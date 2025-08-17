import { NextRequest, NextResponse } from 'next/server';
import { RedisContextService } from '../../../../services/context/RedisContextService';
import { BasicOrchestrator } from '../../../../services/orchestration/BasicOrchestrator';
import { Pool } from 'pg';

// Initialize services
const contextService = new RedisContextService();

// Initialize database pool (you'll need to configure this with your DB settings)
const dbPool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/hhbot',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

const orchestrator = new BasicOrchestrator(contextService, dbPool);

export async function POST(request: NextRequest) {
  const correlationId = contextService.generateCorrelationId();

  try {
    const body = await request.json();
    const { userId = 'test-user', tenantId = 'default', testParam = 'Hello World' } = body;

    console.log(`[${correlationId}] POST /api/workflow/test - Starting test workflow`);

    // Execute test workflow
    const executionId = await orchestrator.executeWorkflow(
      'test_workflow',
      userId,
      tenantId,
      { testParam },
      correlationId
    );

    console.log(`[${correlationId}] Test workflow started:`, executionId);

    return NextResponse.json({
      success: true,
      executionId,
      correlationId,
      message: 'Test workflow started successfully'
    });

  } catch (error) {
    console.error(`[${correlationId}] Test workflow failed:`, error);

    return NextResponse.json(
      {
        error: 'Workflow execution failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        correlationId
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const executionId = searchParams.get('executionId');
  const correlationId = contextService.generateCorrelationId();

  console.log(`[${correlationId}] GET /api/workflow/test - Getting workflow status:`, executionId);

  if (!executionId) {
    return NextResponse.json(
      { error: 'executionId parameter is required' },
      { status: 400 }
    );
  }

  try {
    const status = await orchestrator.getWorkflowStatus(executionId);

    if (!status) {
      return NextResponse.json(
        { error: 'Workflow not found' },
        { status: 404 }
      );
    }

    console.log(`[${correlationId}] Workflow status retrieved:`, status.status);

    return NextResponse.json({
      success: true,
      workflow: status,
      correlationId
    });

  } catch (error) {
    console.error(`[${correlationId}] Error getting workflow status:`, error);

    return NextResponse.json(
      {
        error: 'Failed to get workflow status',
        details: error instanceof Error ? error.message : 'Unknown error',
        correlationId
      },
      { status: 500 }
    );
  }
}
