import { NextRequest, NextResponse } from 'next/server';
import { listMediaAssets } from '@/lib/media-storage';

export async function GET(request: NextRequest) {
  try {
    console.log('[layouts] Fetching all layout assets...');
    
    // Get all layout assets using media-storage
    const result = await listMediaAssets('layout', { 
      loadAll: true 
    });

    console.log(`[layouts] Found ${result.assets.length} layout assets`);

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
