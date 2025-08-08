import { NextRequest, NextResponse } from 'next/server';

// Simple in-memory status store (per serverless instance). Suitable for demo and dev.
// For production, back with a database or KV.
type GenerationStatus = {
  running: boolean;
  startedAt?: string;
  finishedAt?: string;
  params?: any;
  url?: string | null;
  mode?: 'image' | 'video' | 'audio' | 'text' | null;
  error?: string | null;
};

let lastStatus: { generation: GenerationStatus } = {
  generation: { running: false, url: null, mode: null, error: null },
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(lastStatus);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    lastStatus = { ...lastStatus, ...body };
    return NextResponse.json({ ok: true, status: lastStatus });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Invalid body' }, { status: 400 });
  }
}


