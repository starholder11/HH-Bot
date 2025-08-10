import { NextRequest, NextResponse } from 'next/server';
import { readJsonFromS3, listKeys } from '@/lib/s3-upload';

// Ensure no caching and Node runtime on Vercel
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    // Load canvas index (preferred)
    let indexData: any = null;
    try {
      indexData = await readJsonFromS3('canvases/index.json');
    } catch {}

    // Build entries from index or fallback to listing keys
    let entries: Array<{ id: string; name?: string; key?: string; updatedAt?: string }> = [];
    if (indexData && Array.isArray(indexData.items)) {
      entries = indexData.items as any[];
    } else {
      const keys = await listKeys('canvases/', 5000);
      const canvasKeys = keys.filter((k) => k.endsWith('.json') && !k.endsWith('/index.json'));
      entries = canvasKeys.map((k) => ({ id: k.split('/').pop()!.replace('.json', ''), key: k }));
    }

    // Sort newest-first by updatedAt when available
    const sorted = [...entries].sort(
      (a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()
    );

    // Read all canvases in parallel (robust + fast)
    const canvases = await Promise.all(
      sorted.map(async (entry) => {
        const key = entry.key || `canvases/${entry.id}.json`;
        try {
          const data = await readJsonFromS3(key);
          return data as any;
        } catch (err) {
          // Skip unreadable canvases but keep going
          return null;
        }
      })
    );

    // Aggregate completed LoRAs with artifact URL/path present
    const allLoras: Array<{
      canvasId: string;
      canvasName: string;
      loraId: string;
      path: string;
      triggerWord: string;
      scale: number;
      artifactUrl: string;
      status: string;
    }> = [];

    for (const canvas of canvases) {
      if (!canvas || !Array.isArray(canvas.loras)) continue;
      for (const lora of canvas.loras) {
        const status = String(lora?.status || '').toLowerCase();
        const artifact = lora?.artifactUrl || lora?.path;
        if (status === 'completed' && artifact) {
          allLoras.push({
            canvasId: canvas.id,
            canvasName: canvas.name || canvas.id,
            loraId: lora.id || lora.requestId,
            path: artifact,
            triggerWord: lora.triggerWord || 'CANVAS_STYLE',
            scale: 1.0,
            artifactUrl: artifact,
            status: lora.status,
          });
        }
      }
    }

    return NextResponse.json(allLoras);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch LoRAs' }, { status: 500 });
  }
}
