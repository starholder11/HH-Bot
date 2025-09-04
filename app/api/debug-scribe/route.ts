import { NextRequest, NextResponse } from 'next/server';
import Redis from 'ioredis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action') || 'status';

    // Check Redis connection
    const redisUrl = process.env.REDIS_AGENTIC_URL || process.env.REDIS_URL;
    if (!redisUrl) {
      return NextResponse.json({ error: 'Redis not configured' }, { status: 500 });
    }

    const redis = new Redis(redisUrl);

    try {
      switch (action) {
        case 'status':
          const info = await redis.info('server');
          const keys = await redis.keys('*');

          return NextResponse.json({
            redis: {
              connected: true,
              info: info.split('\n').slice(0, 5).join('\n'),
              totalKeys: keys.length,
              keys: keys.slice(0, 20) // First 20 keys
            }
          });

        case 'text-assets':
          const pendingQueue = await redis.lrange('textAssets:pending', 0, -1);
          const drafts = [];

          for (const slug of pendingQueue.slice(0, 5)) {
            const draft = await redis.get(`textAsset:draft:${slug}`);
            if (draft) {
              drafts.push({ slug, draft: JSON.parse(draft) });
            }
          }

          return NextResponse.json({
            pendingQueue,
            drafts
          });

        case 'workflows':
          const workflowKeys = await redis.keys('workflow:*');
          const workflows = [];

          for (const key of workflowKeys.slice(0, 5)) {
            const workflow = await redis.get(key);
            if (workflow) {
              workflows.push({ key, workflow: JSON.parse(workflow) });
            }
          }

          return NextResponse.json({
            workflowKeys: workflowKeys.length,
            workflows
          });

        default:
          return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
      }
    } finally {
      await redis.quit();
    }

  } catch (error) {
    console.error('[debug-scribe] Error:', error);
    return NextResponse.json({
      error: 'Debug failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
