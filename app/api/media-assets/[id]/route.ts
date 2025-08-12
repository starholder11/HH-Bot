import { NextRequest, NextResponse } from 'next/server';
import { getMediaAsset } from '@/lib/media-storage';

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
    const asset = await getMediaAsset(id);
    
    if (!asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
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
