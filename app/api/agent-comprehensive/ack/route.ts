import { NextRequest, NextResponse } from 'next/server';
import { RedisContextService } from '@/services/context/RedisContextService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Backend ack endpoint with VPC Redis access
// Body: { correlationId: string, step: string, artifacts?: any }
export async function POST(req: NextRequest) {
  try {
    const { correlationId, step, artifacts } = await req.json();
    if (!correlationId || !step) {
      return NextResponse.json({ ok: false, error: 'correlationId and step are required' }, { status: 400 });
    }

    const redis = new RedisContextService(process.env.REDIS_AGENTIC_URL || process.env.REDIS_URL);
    const key = `ack:${correlationId}:${step}`;
    
    // Store ack payload with short TTL; agent proxy will poll for it
    // @ts-ignore accessing internal redis
    await (redis as any).redis.setex(key, 60, JSON.stringify({ 
      at: new Date().toISOString(), 
      artifacts: artifacts || {},
      correlationId,
      step
    }));

    console.log(`[${correlationId}] Ack received for step: ${step}`, artifacts);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('Backend ack failed:', e);
    return NextResponse.json({ ok: false, error: e?.message || 'Redis error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const correlationId = searchParams.get('correlationId');
    const step = searchParams.get('step');
    
    if (!correlationId || !step) {
      return NextResponse.json({ acked: false, error: 'correlationId and step are required' }, { status: 400 });
    }

    const redis = new RedisContextService(process.env.REDIS_AGENTIC_URL || process.env.REDIS_URL);
    const key = `ack:${correlationId}:${step}`;
    
    // Check if ack exists in Redis
    // @ts-ignore accessing internal redis
    const ackData = await (redis as any).redis.get(key);
    
    if (ackData) {
      const parsed = JSON.parse(ackData);
      return NextResponse.json({ acked: true, data: parsed });
    } else {
      return NextResponse.json({ acked: false });
    }
  } catch (e: any) {
    console.error('Backend ack check failed:', e);
    return NextResponse.json({ acked: false, error: e?.message || 'Redis error' }, { status: 500 });
  }
}
