import { NextRequest, NextResponse } from 'next/server';
import { readdir, readFile } from 'fs/promises';
import path from 'path';

interface KeyframeStill {
  id: string;
  parent_video_id: string;
  processing_status?: {
    ai_labeling: string;
  };
}

interface VideoAsset {
  id: string;
  title: string;
  processing_status?: {
    ai_labeling: string;
  };
  keyframe_stills?: KeyframeStill[];
}

async function triggerKeyframeLabeling(keyframeId: string) {
  try {
    console.log(`Triggering AI labeling for keyframe: ${keyframeId}`);

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

    const response = await fetch(`${baseUrl}/api/media-labeling/images/ai-label`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        assetId: keyframeId
      })
    });

    if (!response.ok) {
      console.error(`Failed to trigger keyframe labeling for ${keyframeId}: ${response.status}`);
      return false;
    }

    console.log(`Successfully triggered AI labeling for keyframe: ${keyframeId}`);
    return true;
  } catch (error) {
    console.error(`Error triggering keyframe labeling for ${keyframeId}:`, error);
    return false;
  }
}

async function loadVideoAssets(): Promise<VideoAsset[]> {
  try {
    const videosDir = path.join(process.cwd(), 'lib', 'data', 'video-assets');
    const files = await readdir(videosDir);
    const videoFiles = files.filter(file => file.endsWith('.json'));

    const videos: VideoAsset[] = [];
    for (const file of videoFiles) {
      try {
        const filePath = path.join(videosDir, file);
        const content = await readFile(filePath, 'utf-8');
        const video = JSON.parse(content);
        videos.push(video);
      } catch (error) {
        console.error(`Error reading video file ${file}:`, error);
      }
    }

    return videos;
  } catch (error) {
    console.error('Error loading video assets:', error);
    return [];
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { videoIds, triggerAll = false } = body;

    console.log('Starting keyframe fix process...');

    // Load all video assets
    const videos = await loadVideoAssets();
    console.log(`Loaded ${videos.length} video assets`);

    // Filter videos that need keyframe fixing
    const videosToFix = videos.filter(video => {
      // If specific video IDs provided, only process those
      if (videoIds && videoIds.length > 0) {
        return videoIds.includes(video.id) || videoIds.includes(video.title);
      }

      // If triggerAll is true, find all videos with pending keyframes
      if (triggerAll) {
        return video.processing_status?.ai_labeling === 'completed' &&
               video.keyframe_stills?.some(kf =>
                 ['pending', 'not_started'].includes(kf.processing_status?.ai_labeling || '')
               );
      }

      return false;
    });

    console.log(`Found ${videosToFix.length} videos that need keyframe fixing`);

    const results = [];
    let totalTriggered = 0;
    let totalSuccess = 0;

    for (const video of videosToFix) {
      console.log(`\nProcessing video: ${video.title} (${video.id})`);

      const pendingKeyframes = video.keyframe_stills?.filter(kf =>
        ['pending', 'not_started'].includes(kf.processing_status?.ai_labeling || '')
      ) || [];

      console.log(`  Found ${pendingKeyframes.length} pending keyframes`);

      const videoResult = {
        videoId: video.id,
        title: video.title,
        pendingKeyframes: pendingKeyframes.length,
        triggered: 0,
        success: 0,
        errors: [] as string[]
      };

      for (const keyframe of pendingKeyframes) {
        totalTriggered++;
        videoResult.triggered++;

        const success = await triggerKeyframeLabeling(keyframe.id);
        if (success) {
          totalSuccess++;
          videoResult.success++;
        } else {
          videoResult.errors.push(keyframe.id);
        }

        // Add small delay to avoid overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      results.push(videoResult);
    }

    console.log(`\nKeyframe fix complete:`);
    console.log(`  Videos processed: ${videosToFix.length}`);
    console.log(`  Keyframes triggered: ${totalTriggered}`);
    console.log(`  Successful: ${totalSuccess}`);
    console.log(`  Failed: ${totalTriggered - totalSuccess}`);

    return NextResponse.json({
      success: true,
      summary: {
        videosProcessed: videosToFix.length,
        keyframesTriggered: totalTriggered,
        successful: totalSuccess,
        failed: totalTriggered - totalSuccess
      },
      results
    });

  } catch (error) {
    console.error('Error in keyframe fix process:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const videos = await loadVideoAssets();

    // Find videos with completed AI labeling but pending keyframes
    const problematicVideos = videos.filter(video =>
      video.processing_status?.ai_labeling === 'completed' &&
      video.keyframe_stills?.some(kf =>
        ['pending', 'not_started'].includes(kf.processing_status?.ai_labeling || '')
      )
    ).map(video => ({
      id: video.id,
      title: video.title,
      pendingKeyframes: video.keyframe_stills?.filter(kf =>
        ['pending', 'not_started'].includes(kf.processing_status?.ai_labeling || '')
      ).length || 0,
      totalKeyframes: video.keyframe_stills?.length || 0
    }));

    return NextResponse.json({
      success: true,
      problematicVideos,
      count: problematicVideos.length
    });

  } catch (error) {
    console.error('Error finding problematic videos:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }, { status: 500 });
  }
}
