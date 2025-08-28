import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { correlationId, step, artifacts } = await req.json();
    if (!correlationId || !step) {
      return NextResponse.json({ success: false, error: 'correlationId and step are required' }, { status: 400 });
    }

    const backendUrl = process.env.LANCEDB_API_URL || '';
    if (!backendUrl) {
      return NextResponse.json({ success: false, error: 'LANCEDB_API_URL not configured' }, { status: 500 });
    }

    const resp = await fetch(`${backendUrl}/api/agent-comprehensive/ack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ correlationId, step: String(step).toLowerCase(), artifacts: artifacts || {} })
    });

    if (!resp.ok) {
      const text = await resp.text();
      return NextResponse.json({ success: false, error: `Backend ack failed: ${resp.status} ${text}` }, { status: 502 });
    }

    const json = await resp.json();
    return NextResponse.json({ success: true, ack: json });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Unknown error' }, { status: 500 });
  }
}


