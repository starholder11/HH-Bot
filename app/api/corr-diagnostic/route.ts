import { NextRequest, NextResponse } from 'next/server';
import { SimpleWorkflowGenerator } from '../../../services/intelligence/SimpleWorkflowGenerator';
import { UniversalToolRegistry } from '../../../services/tools/UniversalToolRegistry';
import { ToolExecutor } from '../../../services/tools/ToolExecutor';
import { RedisContextService } from '../../../services/context/RedisContextService';

let workflowGenerator: SimpleWorkflowGenerator | null = null;
let contextService: RedisContextService | null = null;
let registry: UniversalToolRegistry | null = null;
let executor: ToolExecutor | null = null;

async function ensureInit() {
  if (!workflowGenerator) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    contextService = new RedisContextService(redisUrl);
    registry = new UniversalToolRegistry(contextService, process.env.LANCEDB_API_URL || 'http://localhost:3000', process.cwd());
    await registry.initializeAllTools();
    executor = new ToolExecutor(registry, contextService);
    workflowGenerator = new SimpleWorkflowGenerator(registry as any, executor, contextService);
  }
}

export async function GET(request: NextRequest) {
  await ensureInit();
  const url = new URL(request.url);
  const corr = url.searchParams.get('corr');
  const message = url.searchParams.get('message') || 'diagnostic run';
  const userId = url.searchParams.get('userId') || 'diagnostic-user';
  const tenantId = url.searchParams.get('tenantId') || 'default';

  if (!corr) {
    return NextResponse.json({ error: 'missing corr' }, { status: 400 });
  }

  const buildSha = process.env.APP_BUILD_SHA || 'unknown';
  const routeFile = __filename;

  try {
    const result = await (workflowGenerator as any).processNaturalLanguageRequestV2({
      userMessage: message,
      userId,
      tenantId,
      correlationId: corr
    });

    const response = NextResponse.json({
      routeCorr: corr,
      generatorCorr: corr,
      executionId: result.execution?.id,
      status: result.execution?.status,
      buildSha,
      routeFile
    });
    response.headers.set('x-build-sha', buildSha);
    response.headers.set('x-route-file', routeFile);
    return response;

  } catch (err: any) {
    const response = NextResponse.json({
      routeCorr: corr,
      error: err?.message || String(err),
      buildSha,
      routeFile
    }, { status: 500 });
    response.headers.set('x-build-sha', buildSha);
    response.headers.set('x-route-file', routeFile);
    return response;
  }
}


