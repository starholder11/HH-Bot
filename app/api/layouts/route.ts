import { NextRequest, NextResponse } from 'next/server';
import { listMediaAssets } from '@/lib/media-storage';
import { readJsonFromS3 } from '@/lib/s3-upload';
import { getS3Client, getBucketName } from '@/lib/s3-config';
import { GetObjectCommand } from '@aws-sdk/client-s3';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    console.log('[layouts] Fetching layout assets...');

    let layouts: any[] = [];

    // Try fast path first: use layouts index for instant results
    try {
      const idx = await readJsonFromS3('layouts/index.json');
        if (idx && Array.isArray(idx.items) && idx.items.length) {
          // Fetch by IDs listed in index
          const s3 = getS3Client();
          const bucket = getBucketName();
          const ids = idx.items.map((i: any) => i.id);
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
    } catch (error) {
      console.log('[layouts] Index not found, falling back to S3 scan...');
    }

    // If fast path failed, fall back to slower S3 scan (paginated)
    if (!layouts.length) {
      console.log('[layouts] Using S3 scan fallback...');
      const result = await listMediaAssets('layout', { page: 1, limit: 100 });
      layouts = result.assets;
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
