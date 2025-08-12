import { NextRequest, NextResponse } from 'next/server';
import { listMediaAssets } from '@/lib/media-storage';

export async function GET(request: NextRequest) {
  try {
    console.log('[layouts] Fetching all layout assets...');
    
    // Get all assets and filter for layouts manually for debugging
    const result = await listMediaAssets(undefined, { 
      loadAll: true 
    });
    
    // Filter for layout assets manually
    const layoutAssets = result.assets.filter(asset => asset.media_type === 'layout');
    
    console.log(`[layouts] Total assets found: ${result.assets.length}`);
    console.log(`[layouts] Layout assets found: ${layoutAssets.length}`);
    console.log(`[layouts] Asset types:`, [...new Set(result.assets.map(a => a.media_type))]);
    
    // Return filtered results
    const filteredResult = {
      assets: layoutAssets,
      totalCount: layoutAssets.length,
      hasMore: false
    };

    console.log(`[layouts] Found ${filteredResult.assets.length} layout assets`);

    return NextResponse.json({
      success: true,
      layouts: filteredResult.assets,
      total: filteredResult.totalCount
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
