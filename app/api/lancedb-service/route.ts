import { NextRequest, NextResponse } from 'next/server';

// Small helper endpoint to call LanceDB /delete-text with a guard
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { action, confirm } = body || {};

    if (action !== 'delete-text') {
      return NextResponse.json({ error: 'unsupported action' }, { status: 400 });
    }
    if (confirm !== 'YES_I_UNDERSTAND') {
      return NextResponse.json({ error: 'missing or invalid confirm token' }, { status: 400 });
    }

    const lancedbUrl = process.env.LANCEDB_URL || process.env.LANCEDB_API_URL || 'http://localhost:8000';
    const res = await fetch(`${lancedbUrl}/delete-text`, { method: 'POST' });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch {}
    return NextResponse.json({ status: res.status, ok: res.ok, response: json || text, lancedbUrlResolved: lancedbUrl });
  } catch (err) {
    return NextResponse.json({ error: (err as Error)?.message || 'Unknown error' }, { status: 500 });
  }
}


