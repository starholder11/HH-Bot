import { NextRequest, NextResponse } from 'next/server';
import { listMediaAssets, searchMediaAssets, getAssetStatistics, KeyframeStill, getAllKeyframes } from '@/lib/media-storage';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const mediaTypeParam = searchParams.get('type');
    const mediaType = (mediaTypeParam === 'all' ? null : mediaTypeParam) as 'image' | 'video' | 'audio' | null;
    const searchQuery = searchParams.get('search');
    const projectId = searchParams.get('project');
    const stats = searchParams.get('stats') === 'true';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '100');
    const excludeKeyframes = searchParams.get('exclude_keyframes') === 'true';

    console.log(`[assets-api] Request params: mediaType=${mediaType}, excludeKeyframes=${excludeKeyframes}, searchQuery=${searchQuery}`);

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
      const result = await listMediaAssets(mediaType || undefined, { page, limit, excludeKeyframes });
      assets = result.assets;
      totalCount = result.totalCount;
      hasMore = result.hasMore;
    }

    // Apply project filter first
    if (projectId) {
      assets = assets.filter(asset => asset.project_id === projectId);
    }

    // 🚫 Filter logic with incremental refill when excludeKeyframes flag is on
    if (excludeKeyframes) {
      let nonKeyframes = assets.filter(a => a.media_type !== 'keyframe_still');

      // If we didn’t fill the page, keep fetching subsequent pages until we either
      // 1) have enough non-keyframe assets to satisfy `limit`, or
      // 2) there are no more assets available.
      let nextPage = page + 1;
      let keepFetching = nonKeyframes.length < limit && hasMore;
      while (keepFetching) {
        const next = await listMediaAssets(mediaType || undefined, { page: nextPage, limit, excludeKeyframes });
        const nextFiltered = next.assets.filter(a => a.media_type !== 'keyframe_still');
        nonKeyframes = [...nonKeyframes, ...nextFiltered];
        hasMore = next.hasMore;
        nextPage += 1;
        keepFetching = nonKeyframes.length < limit && hasMore;
        // safety: do not fetch more than 10 pages per request
        if (nextPage - page > 10) keepFetching = false;
      }

      // Trim to requested limit for the response
      assets = nonKeyframes.slice(0, limit);
      totalCount = nonKeyframes.length;
    }

    // 🔑 KEYFRAME INCLUSION: Add keyframes for "all media" and "image" types
    // This ensures keyframes are selectable on initial load
    // Only include keyframes if NOT explicitly excluded
    if (!excludeKeyframes && !searchQuery && (!mediaType || mediaType === 'image')) {
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

    return NextResponse.json({ assets, totalCount, hasMore });
  } catch (error) {
    console.error('Error fetching media assets:', error);
    return NextResponse.json(
      { error: 'Failed to fetch media assets' },
      { status: 500 }
    );
  }
}
