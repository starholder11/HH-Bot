import { NextRequest, NextResponse } from 'next/server';
import Redis from 'ioredis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  try {
    const { slug } = params;
    if (!slug) return NextResponse.json({ error: 'slug is required' }, { status: 400 });

    const redisUrl = process.env.REDIS_AGENTIC_URL || process.env.REDIS_URL;
    if (!redisUrl) return NextResponse.json({ error: 'Redis not configured' }, { status: 500 });

    const r = new Redis(redisUrl);
    try {
      const draftKey = `textAsset:draft:${slug}`;
      const raw = await r.get(draftKey);
      if (!raw) return NextResponse.json({ error: 'Draft not found' }, { status: 404 });

      const draft = JSON.parse(raw);
      return NextResponse.json({
        success: true,
        slug: draft.slug || slug,
        title: draft.indexYaml ? (safeTitleFromYaml(draft.indexYaml) || draft.slug || slug) : (draft.title || draft.slug || slug),
        mdx: draft.mdx || '',
        scribe_enabled: !!draft.scribe_enabled,
        conversation_id: draft.conversation_id || null
      });
    } finally {
      await r.quit();
    }
  } catch (error) {
    console.error('[text-assets draft] GET failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function safeTitleFromYaml(y: string): string | null {
  try {
    const m = /\n?title:\s*"?([^\n\"]+)"?/i.exec(y);
    return m && m[1] ? m[1].trim() : null;
  } catch {
    return null;
  }
}


