import { NextRequest, NextResponse } from 'next/server';
import { RedisContextService } from '../../../../services/context/RedisContextService';

// Ensure this route is always dynamic and not statically evaluated at build time
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

// Initialize Redis context service lazily to avoid build-time network calls
let contextService: RedisContextService | null = null;

export async function GET(request: NextRequest) {
  if (!contextService) {
    contextService = new RedisContextService();
  }
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
