import { NextRequest, NextResponse } from 'next/server';
import Redis from 'ioredis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BATCH_MAX = Number(process.env.TEXT_ASSETS_BATCH_MAX || 10);
const CRON_INTERVAL_MS = Number(process.env.TEXT_ASSETS_BATCH_INTERVAL_MS || (15 * 60 * 1000));

export async function POST(_req: NextRequest) {
  try {
    const redisUrl = process.env.REDIS_AGENTIC_URL;
    if (!redisUrl) return NextResponse.json({ success: false, error: 'Redis not configured' }, { status: 500 });
    const r = new Redis(redisUrl);

    const lastKey = 'textAssets:lastFlush';
    const last = Number(await r.get(lastKey) || 0);
    const now = Date.now();
    const age = now - last;

    const len = await r.llen('textAssets:pending');
    const shouldFlush = len >= BATCH_MAX || age >= CRON_INTERVAL_MS;

    if (!shouldFlush) {
      await r.quit();
      return NextResponse.json({ success: true, skipped: true, reason: { len, age } });
    }

    // Call internal flush endpoint locally
    const flushUrl = `${process.env.PUBLIC_BASE_URL || ''}/api/text-assets/flush`;
    const res = await fetch(flushUrl || '/api/text-assets/flush', { method: 'POST' });
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      await r.set(lastKey, String(now));
    }
    await r.quit();
    return NextResponse.json({ success: res.ok, result: json });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}


