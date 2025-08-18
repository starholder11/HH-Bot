import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Proxy client acks to backend (ECS has VPC access to Redis)
// Body: { correlationId: string, step: string, artifacts?: any }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { correlationId, step, artifacts } = body;

    if (!correlationId || !step) {
      return NextResponse.json({ ok: false, error: 'correlationId and step are required' }, { status: 400 });
    }

    // Forward to backend which has VPC access to Redis
    const backendUrl = process.env.LANCEDB_API_URL || 'http://lancedb-bulletproof-simple-alb-705151448.us-east-1.elb.amazonaws.com';
    const response = await fetch(`${backendUrl}/api/agent-comprehensive/ack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`Backend ack failed: ${response.status}`);
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Proxy failed' }, { status: 500 });
  }
}


