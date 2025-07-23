import { NextRequest, NextResponse } from 'next/server';
import { listMediaAssets, searchMediaAssets, getAssetStatistics, KeyframeStill } from '@/lib/media-storage';

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

    // KEYFRAME INTEGRATION: When filtering for images, also include keyframes
    if (mediaType === 'image') {
      console.log(`[assets-api] Including keyframes for image filter`);

      // Get keyframes separately (they have media_type: 'keyframe_still')
      const allAssets = await listMediaAssets() as any[]; // Get all assets without filter
      const keyframes = allAssets.filter((asset: any) => asset.media_type === 'keyframe_still') as KeyframeStill[];

      console.log(`[assets-api] Found ${keyframes.length} keyframes to include with images`);

      // Transform keyframes to look like image assets for the UI
      const transformedKeyframes = keyframes.map((keyframe: KeyframeStill) => ({
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
      }));

      // Add transformed keyframes to the asset list
      assets = [...assets, ...transformedKeyframes];

      // Sort by creation date (newest first) after combining
      assets.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
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
