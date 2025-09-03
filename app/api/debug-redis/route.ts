import { NextRequest, NextResponse } from 'next/server';
import Redis from 'ioredis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const redisUrl = process.env.REDIS_AGENTIC_URL;
    if (!redisUrl) {
      return NextResponse.json({ error: 'REDIS_AGENTIC_URL not configured' }, { status: 500 });
    }

    const r = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false, connectTimeout: 1000 });
    
    try {
      if (r.connect) {
        await r.connect();
      }
      
      const pending = await r.lrange('textAssets:pending', 0, -1);
      const slugs = ['kestrel-7', 'kestrel-17', 'denmark'];
      const drafts: any = {};
      
      for (const slug of slugs) {
        const key = `textAsset:draft:${slug}`;
        const draft = await r.get(key);
        const ttl = await r.ttl(key);
        drafts[slug] = {
          inPending: pending.includes(slug),
          draftExists: !!draft,
          ttl,
          draftSize: draft ? draft.length : 0
        };
      }
      
      return NextResponse.json({
        pending,
        pendingCount: pending.length,
        drafts
      });
      
    } finally {
      try { r.disconnect(); } catch {}
    }
    
  } catch (error) {
    console.error('[debug-redis] Error:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}
