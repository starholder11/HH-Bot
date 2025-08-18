import { NextRequest, NextResponse } from 'next/server';
import { RedisContextService } from '@/services/context/RedisContextService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Client acks a completed step with produced artifacts
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
    await (redis as any).redis.setex(key, 60, JSON.stringify({ at: new Date().toISOString(), artifacts: artifacts || {} }));

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Invalid body' }, { status: 400 });
  }
}


