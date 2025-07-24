import { NextRequest, NextResponse } from 'next/server';
import { listMediaAssets, searchMediaAssets, getAssetStatistics, KeyframeStill, getAllKeyframes } from '@/lib/media-storage';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const mediaType = searchParams.get('type') as 'image' | 'video' | 'audio' | null;
    const searchQuery = searchParams.get('search');
    const projectId = searchParams.get('project');
    const stats = searchParams.get('stats') === 'true';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '100');

    // Return statistics if requested
    if (stats) {
      const statistics = await getAssetStatistics();
      return NextResponse.json(statistics);
    }

    let assets;
    let totalCount = 0;
    let hasMore = false;

    if (searchQuery) {
      // Search across assets (load all for search)
      assets = await searchMediaAssets(searchQuery, mediaType || undefined);
      totalCount = assets.length;
      // Apply pagination to search results
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedAssets = assets.slice(startIndex, endIndex);
      hasMore = endIndex < totalCount;
      assets = paginatedAssets;
    } else {
      // List assets with pagination
      const result = await listMediaAssets(mediaType || undefined, { page, limit });
      assets = result.assets;
      totalCount = result.totalCount;
      hasMore = result.hasMore;
    }

    // 🔑 KEYFRAME INCLUSION: Add keyframes for "all media" and "image" types
    // This ensures keyframes are selectable on initial load
    // RE-ENABLED FOR DEBUGGING
    if (!searchQuery && (!mediaType || mediaType === 'image')) {
      console.log(`[assets-api] Including keyframes for ${mediaType || 'all media'}`);

      try {
        const keyframes = await getAllKeyframes();

        // Filter keyframes by project if specified
        const filteredKeyframes = projectId
          ? keyframes.filter(kf => kf.project_id === projectId)
          : keyframes;

        // Transform keyframes to match MediaAsset interface and add to assets
        const transformedKeyframes = filteredKeyframes.map(kf => ({
          ...kf,
          // Ensure keyframes have the required MediaAsset properties
          url: kf.s3_url,
          created_at: kf.timestamps.extracted,
          updated_at: kf.timestamps.labeled_ai || kf.timestamps.extracted,
        }));

        console.log(`[assets-api] Found ${transformedKeyframes.length} keyframes to include`);

        // Add keyframes to the asset list (they'll be sorted with other assets)
        assets = [...assets, ...transformedKeyframes];
        totalCount += transformedKeyframes.length;

        // Re-sort combined assets by creation date
        assets.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        // Re-apply pagination to combined results
        if (!searchQuery) {
          const startIndex = (page - 1) * limit;
          const endIndex = startIndex + limit;
          const paginatedAssets = assets.slice(startIndex, endIndex);
          hasMore = endIndex < totalCount;
          assets = paginatedAssets;
        }
      } catch (keyframeError) {
        console.warn(`[assets-api] Failed to load keyframes:`, keyframeError);
        // Continue without keyframes rather than failing the entire request
      }
    }

    // Filter by project if specified (this handles the case where keyframes were added)
    if (projectId) {
      assets = assets.filter(asset => asset.project_id === projectId);
    }

    return NextResponse.json({ assets, totalCount, hasMore });
  } catch (error) {
    console.error('Error fetching media assets:', error);
    return NextResponse.json(
      { error: 'Failed to fetch media assets' },
      { status: 500 }
    );
  }
}
