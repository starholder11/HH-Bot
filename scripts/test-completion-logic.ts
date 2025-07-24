#!/usr/bin/env npx tsx

import { listMediaAssets, VideoAsset } from '../lib/media-storage';

async function analyzeVideoCompletionStatus() {
  console.log('🔍 Analyzing video completion status...\n');

  try {
    const { assets: videos } = await listMediaAssets('video') as { assets: VideoAsset[]; totalCount: number; hasMore: boolean };

    const processingVideos = videos.filter(v =>
      ['processing', 'pending'].includes(v.processing_status?.ai_labeling || '')
    );

    console.log(`📊 Video Status Summary:`);
    console.log(`   Total videos: ${videos.length}`);
    console.log(`   Stuck in processing/pending: ${processingVideos.length}`);
    console.log(`   Completed: ${videos.filter(v => v.processing_status?.ai_labeling === 'completed').length}`);
    console.log(`   Failed: ${videos.filter(v => v.processing_status?.ai_labeling === 'failed').length}\n`);

    if (processingVideos.length === 0) {
      console.log('✅ No videos stuck in processing!');
      return;
    }

    console.log('📋 Videos stuck in processing:');
    console.log('=' .repeat(80));

    for (const video of processingVideos) {
      const keyframes = video.keyframe_stills || [];
      const completed = keyframes.filter(kf => kf.processing_status?.ai_labeling === 'completed').length;
      const failed = keyframes.filter(kf => kf.processing_status?.ai_labeling === 'failed').length;
      const pending = keyframes.filter(kf => kf.processing_status?.ai_labeling === 'pending').length;
      const processing = keyframes.filter(kf => kf.processing_status?.ai_labeling === 'processing').length;

      const completionRatio = keyframes.length > 0 ? completed / keyframes.length : 0;
      const wouldComplete = completionRatio >= 0.75;

      console.log(`🎬 ${video.title}`);
      console.log(`   ID: ${video.id}`);
      console.log(`   Status: ${video.processing_status?.ai_labeling}`);
      console.log(`   Keyframes: ${completed}/${keyframes.length} completed (${Math.round(completionRatio * 100)}%)`);
      console.log(`   Breakdown: ✅${completed} ❌${failed} ⏳${pending} 🔄${processing}`);
      console.log(`   ${wouldComplete ? '✅ WOULD COMPLETE with 75% threshold' : '❌ Needs more work'}`);

      if (failed > 0) {
        const retryableCount = keyframes.filter(kf =>
          kf.processing_status?.ai_labeling === 'failed' && (kf.retry_count || 0) < 3
        ).length;
        console.log(`   🔄 ${retryableCount} keyframes eligible for retry`);
      }

      console.log('');
    }

    console.log('\n🛠️  Available actions:');
    console.log('   1. Test evaluate-completion endpoint:');
    console.log('      curl -X POST "http://localhost:3000/api/media-labeling/videos/evaluate-completion" \\');
    console.log('           -H "Content-Type: application/json" \\');
    console.log('           -d \'{"forceAll": true, "completionThreshold": 0.75}\'');
    console.log('');
    console.log('   2. Evaluate specific video:');
    const firstVideo = processingVideos[0];
    if (firstVideo) {
      console.log('      curl -X POST "http://localhost:3000/api/media-labeling/videos/evaluate-completion" \\');
      console.log('           -H "Content-Type: application/json" \\');
      console.log(`           -d '{"videoId": "${firstVideo.id}", "completionThreshold": 0.75}'`);
    }

  } catch (error) {
    console.error('❌ Error analyzing videos:', error);
  }
}

// Run the analysis
analyzeVideoCompletionStatus();
