import { NextRequest, NextResponse } from 'next/server';
import { listMediaAssets, searchMediaAssets, getAssetStatistics } from '@/lib/media-storage';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const mediaType = searchParams.get('type') as 'image' | 'video' | 'audio' | null;
    const searchQuery = searchParams.get('search');
    const projectId = searchParams.get('project');
    const stats = searchParams.get('stats') === 'true';

    // Return statistics if requested
    if (stats) {
      const statistics = await getAssetStatistics();
      return NextResponse.json(statistics);
    }

    let assets;

    if (searchQuery) {
      // Search across assets
      assets = await searchMediaAssets(searchQuery, mediaType || undefined);
    } else {
      // List assets with optional type filter
      assets = await listMediaAssets(mediaType || undefined);
    }

    // Filter by project if specified
    if (projectId) {
      assets = assets.filter(asset => asset.project_id === projectId);
    }

    return NextResponse.json(assets);
  } catch (error) {
    console.error('Error fetching media assets:', error);
    return NextResponse.json(
      { error: 'Failed to fetch media assets' },
      { status: 500 }
    );
  }
}
