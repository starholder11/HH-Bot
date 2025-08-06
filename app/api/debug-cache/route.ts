import { NextRequest, NextResponse } from 'next/server';
import { clearS3KeysCache, getCacheStatus } from '@/lib/media-storage';

export async function GET(request: NextRequest) {
  try {
    const cacheStatus = getCacheStatus();
    return NextResponse.json({
      cacheStatus,
      message: 'Cache status retrieved'
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to get cache status', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    clearS3KeysCache();
    return NextResponse.json({
      success: true,
      message: 'All caches cleared',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to clear cache', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
