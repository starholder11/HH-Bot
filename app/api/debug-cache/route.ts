import { NextRequest, NextResponse } from 'next/server';
import { clearS3KeysCache, getCacheStatus } from '@/lib/media-storage';

export async function POST(request: NextRequest) {
  try {
    console.log('[debug-cache] Clearing S3 keys cache...');
    clearS3KeysCache();
    
    return NextResponse.json({
      success: true,
      message: 'S3 keys cache cleared successfully'
    });
  } catch (error) {
    console.error('[debug-cache] Error clearing cache:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to clear cache',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const status = getCacheStatus();
    
    return NextResponse.json({
      success: true,
      cache_status: status
    });
  } catch (error) {
    console.error('[debug-cache] Error getting cache status:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to get cache status',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}