import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Basic readiness: env sanity (do not expose secrets)
    const hasOpenAI = !!process.env.OPENAI_API_KEY;
    const hasApiUrl = !!process.env.LANCEDB_API_URL;

    return NextResponse.json({
      ok: true,
      status: 'healthy',
      service: 'hh-agent-app',
      checks: {
        openaiConfigured: hasOpenAI,
        lancedbApiUrlConfigured: hasApiUrl,
      },
      timestamp: new Date().toISOString()
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, status: 'unhealthy', error: e?.message || 'unknown' }, { status: 500 });
  }
}
