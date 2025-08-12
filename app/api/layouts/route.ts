import { NextRequest, NextResponse } from 'next/server';
import { listMediaAssets } from '@/lib/media-storage';

export async function GET(request: NextRequest) {
  try {
    console.log('[layouts] Fetching all layout assets...');

    // IMPORTANT: ask storage to scan across keys and collect layout assets
    // DO NOT pass loadAll here, so the implementation progressively scans all keys
    // until it has collected up to `limit` matching 'layout' assets.
    const page = 1;
    const limit = 500; // collect up to 500 layouts if present
    const result = await listMediaAssets('layout', { page, limit });

    console.log(`[layouts] Found ${result.assets.length} layout assets (page=${page}, limit=${limit})`);

    return NextResponse.json({
      success: true,
      layouts: result.assets,
      total: result.totalCount
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
