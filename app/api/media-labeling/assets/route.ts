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

    // KEYFRAME INTEGRATION: When filtering for images OR loading all media, also include keyframes
    if (mediaType === 'image' || !mediaType) {
      console.log(`[assets-api] Including keyframes for ${mediaType ? 'image filter' : 'all media'}`);

      // Get keyframes separately (they're stored in a different directory)
      const keyframes = await getAllKeyframes();

      console.log(`[assets-api] Found ${keyframes.length} keyframes to include`);

      // Transform keyframes to look like image assets for the UI
      const transformedKeyframes = keyframes.map((keyframe: KeyframeStill) => {
        console.log(`[assets-api] Transforming keyframe ${keyframe.id}: has ai_labels=${!!keyframe.ai_labels}, scenes count=${keyframe.ai_labels?.scenes?.length || 0}`);

        return {
          id: keyframe.id,
          filename: keyframe.filename,
          s3_url: keyframe.s3_url,
          cloudflare_url: keyframe.cloudflare_url,
          title: keyframe.title,
          media_type: 'image' as const, // Present as image to the UI
          metadata: {
            width: keyframe.metadata.resolution.width,
            height: keyframe.metadata.resolution.height,
            format: keyframe.metadata.format,
            file_size: keyframe.metadata.file_size,
            color_space: keyframe.metadata.color_profile,
            aspect_ratio: keyframe.metadata.aspect_ratio,
          },
          ai_labels: keyframe.ai_labels || {
            scenes: [],
            objects: [],
            style: [],
            mood: [],
            themes: [],
            confidence_scores: {},
          },
        manual_labels: {
          scenes: [],
          objects: [],
          style: [],
          mood: [],
          themes: [],
          custom_tags: [`keyframe-from-${keyframe.source_info.video_filename}`],
        },
        processing_status: {
          upload: 'completed' as const,
          metadata_extraction: 'completed' as const,
          ai_labeling: keyframe.processing_status.ai_labeling,
          manual_review: keyframe.processing_status.manual_review,
        },
        timestamps: {
          uploaded: keyframe.timestamps.extracted,
          metadata_extracted: keyframe.timestamps.extracted,
          labeled_ai: keyframe.timestamps.labeled_ai,
          labeled_reviewed: keyframe.timestamps.labeled_reviewed,
        },
        labeling_complete: keyframe.labeling_complete,
        project_id: keyframe.project_id,
        created_at: keyframe.timestamps.extracted,
        updated_at: keyframe.timestamps.labeled_ai || keyframe.timestamps.extracted,
        // Add a flag to identify these as keyframes for special handling
        _keyframe_metadata: {
          parent_video_id: keyframe.parent_video_id,
          timestamp: keyframe.timestamp,
          frame_number: keyframe.frame_number,
          source_video: keyframe.source_info.video_filename
        }
      };
      });

      // Add transformed keyframes to the asset list
      assets = [...assets, ...transformedKeyframes];

      // Sort by creation date (newest first) after combining
      assets.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    // Filter by project if specified
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
