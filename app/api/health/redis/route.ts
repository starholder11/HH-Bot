import { NextRequest, NextResponse } from 'next/server';
import { RedisContextService } from '../../../../services/context/RedisContextService';

// Initialize Redis context service
const contextService = new RedisContextService();

export async function GET(request: NextRequest) {
  const correlationId = contextService.generateCorrelationId();

  console.log(`[${correlationId}] GET /api/health/redis - Health check requested`);

  try {
    const healthStatus = await contextService.getHealthStatus();

    console.log(`[${correlationId}] Redis health check completed:`, healthStatus.status);

    return NextResponse.json({
      service: 'redis-context',
      timestamp: new Date().toISOString(),
      correlationId,
      ...healthStatus
    });

  } catch (error) {
    console.error(`[${correlationId}] Redis health check failed:`, error);

    return NextResponse.json(
      {
        service: 'redis-context',
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        correlationId,
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      },
      { status: 503 }
    );
  }
}
