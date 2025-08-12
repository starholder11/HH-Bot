import { NextRequest, NextResponse } from 'next/server';
import { getMediaAsset, listMediaAssets } from '@/lib/media-storage';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    if (!id) {
      return NextResponse.json({ error: 'Asset ID is required' }, { status: 400 });
    }

    console.log(`[media-assets] Fetching full metadata for asset: ${id}`);

    // Get the complete asset data from S3 JSON storage
    let asset = await getMediaAsset(id);

    // Optional fallback: if not found by id, try to resolve by URL hint
    if (!asset) {
      const urlHint = new URL(request.url).searchParams.get('url');
      if (urlHint) {
        try {
          // Load a reasonably sized page of assets and try to match by URL
          const { assets } = await listMediaAssets(undefined, { page: 1, limit: 1000, excludeKeyframes: false });
          asset = assets.find((a: any) => a?.s3_url === urlHint || a?.cloudflare_url === urlHint) || null;
        } catch {}
      }
    }

    if (!asset) {
      return NextResponse.json({ success: false, error: 'Asset not found' }, { status: 404 });
    }

    console.log(`[media-assets] Found asset: ${asset.title} (${asset.media_type})`);

    // Return the complete asset with all metadata, AI labels, manual labels, etc.
    return NextResponse.json({
      success: true,
      asset
    });

  } catch (error) {
    console.error('[media-assets] Error fetching asset:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch asset metadata',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
