import { NextRequest, NextResponse } from 'next/server';
import Redis from 'ioredis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const slug = searchParams.get('slug');
    
    if (!slug) {
      return NextResponse.json({ error: 'slug is required' }, { status: 400 });
    }

    const redisUrl = process.env.REDIS_AGENTIC_URL || process.env.REDIS_URL;
    if (!redisUrl) {
      return NextResponse.json({ error: 'Redis not configured' }, { status: 500 });
    }

    const r = new Redis(redisUrl);
    try {
      const draftKey = `textAsset:draft:${slug}`;
      const raw = await r.get(draftKey);
      
      if (!raw) {
        return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
      }

      const draft = JSON.parse(raw);
      return NextResponse.json({
        success: true,
        slug: draft.slug || slug,
        title: safeTitleFromYaml(draft.indexYaml) || draft.title || slug,
        mdx: draft.mdx || '',
        scribe_enabled: !!draft.scribe_enabled,
        conversation_id: draft.conversation_id || null,
        updatedAt: draft.updatedAt
      });

    } finally {
      await r.quit();
    }

  } catch (error) {
    console.error('[text-assets enqueue] GET failed:', error);
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

function safeTitleFromYaml(y: string): string | null {
  if (!y) return null;
  try {
    const m = /title:\s*"?([^\n"]+)"?/i.exec(y);
    return m && m[1] ? m[1].trim() : null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { slug, indexYaml, mdx, scribe_enabled, conversation_id } = await req.json();

    if (!slug) {
      return NextResponse.json({ error: 'slug is required' }, { status: 400 });
    }

    const redisUrl = process.env.REDIS_AGENTIC_URL || process.env.REDIS_URL;
    if (!redisUrl) {
      return NextResponse.json({ error: 'Redis not configured' }, { status: 500 });
    }

    const r = new Redis(redisUrl);
    const draftKey = `textAsset:draft:${slug}`;

    try {
      // Store draft with 24h TTL
      await r.set(draftKey, JSON.stringify({
        slug,
        indexYaml,
        mdx,
        scribe_enabled,
        conversation_id,
        updatedAt: Date.now()
      }), 'EX', 60 * 60 * 24);

      // Dedup and add to pending queue
      await r.lrem('textAssets:pending', 0, slug);
      await r.rpush('textAssets:pending', slug);

      console.log(`[text-assets] Enqueued draft: ${slug}`);

      return NextResponse.json({
        enqueued: true,
        slug,
        queuePosition: await r.llen('textAssets:pending')
      });

    } finally {
      await r.quit();
    }

  } catch (error) {
    console.error('[text-assets] Enqueue failed:', error);
    return NextResponse.json({
      error: 'Enqueue failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
