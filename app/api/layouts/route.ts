import { NextRequest, NextResponse } from 'next/server';
import { listMediaAssets } from '@/lib/media-storage';
import { readJsonFromS3 } from '@/lib/s3-upload';
import { getS3Client, getBucketName } from '@/lib/s3-config';
import { GetObjectCommand } from '@aws-sdk/client-s3';

export async function GET(request: NextRequest) {
  try {
    console.log('[layouts] Fetching all layout assets...');

    // IMPORTANT: ask storage to scan across keys and collect layout assets
    // DO NOT pass loadAll here, so the implementation progressively scans all keys
    // until it has collected up to `limit` matching 'layout' assets.
    const page = 1;
    const limit = 500; // collect up to 500 layouts if present
    const result = await listMediaAssets('layout', { page, limit });

    let layouts = result.assets;

    // If none found, try layouts index as a fallback (fast path)
    if (!layouts.length) {
      try {
        const idx = await readJsonFromS3('layouts/index.json');
        if (idx && Array.isArray(idx.items) && idx.items.length) {
          // Fetch by IDs listed in index
          const s3 = getS3Client();
          const bucket = getBucketName();
          const ids = idx.items.slice(0, limit).map((i: any) => i.id);
          const fetched: any[] = [];
          for (const id of ids) {
            try {
              const key = `${process.env.MEDIA_DATA_PREFIX || 'media-labeling/assets/'}${id}.json`;
              const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
              if (obj.Body) {
                const text = await (obj.Body as any).transformToString?.() || '';
                if (text) fetched.push(JSON.parse(text));
              }
            } catch {}
          }
          layouts = fetched.filter(a => a.media_type === 'layout');
        }
      } catch {}
    }

    console.log(`[layouts] Returning ${layouts.length} layout assets`);

    return NextResponse.json({
      success: true,
      layouts,
      total: layouts.length
    });

  } catch (error) {
    console.error('[layouts] Error fetching layouts:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch layouts',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
