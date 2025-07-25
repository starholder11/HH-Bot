#!/usr/bin/env tsx

import { LanceDBIngestionService } from '../lib/lancedb-ingestion';

async function checkKeyframes() {
  console.log('🔍 Checking keyframes availability...');

  const ingestionService = new LanceDBIngestionService();

  try {
    // Test 1: Load media assets WITH keyframes
    console.log('\n📁 Step 1: Loading media assets WITH keyframes...');
    const { listMediaAssets } = await import('../lib/media-storage');

    const mediaResultWithKeyframes = await listMediaAssets(undefined, {
      loadAll: true,
      excludeKeyframes: false // Include keyframes
    });

    console.log(`✅ Loaded ${mediaResultWithKeyframes.assets.length} total assets (including keyframes)`);

    // Count by type
    const byType = mediaResultWithKeyframes.assets.reduce((acc, asset) => {
      acc[asset.media_type] = (acc[asset.media_type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log('📊 Assets by type (including keyframes):');
    Object.entries(byType).forEach(([type, count]) => {
      console.log(`   - ${type}: ${count}`);
    });

    // Test 2: Look for keyframes specifically
    console.log('\n🎬 Step 2: Examining keyframes...');
    const keyframes = mediaResultWithKeyframes.assets.filter(asset => asset.media_type === 'keyframe_still');
    console.log(`✅ Found ${keyframes.length} keyframes`);

    if (keyframes.length > 0) {
      console.log('\n📋 Sample keyframes:');
      keyframes.slice(0, 5).forEach(keyframe => {
        console.log(`   - "${keyframe.title}" (${keyframe.filename})`);
        console.log(`     - Parent: ${keyframe.source_info?.video_filename || 'Unknown'}`);
        console.log(`     - Timestamp: ${keyframe.timestamp || 'Unknown'}`);
        console.log(`     - Scenes: ${keyframe.ai_labels?.scenes?.slice(0, 1).join(', ') || 'None'}`);
        console.log(`     - Objects: ${keyframe.ai_labels?.objects?.slice(0, 3).join(', ') || 'None'}`);
        console.log('');
      });
    }

    // Test 3: Check if keyframes have rich metadata
    console.log('\n🔍 Step 3: Checking keyframe metadata quality...');
    const sampleKeyframe = keyframes[0];
    if (sampleKeyframe) {
      console.log('Sample keyframe metadata:');
      console.log(`   - Title: ${sampleKeyframe.title}`);
      console.log(`   - AI Labels: ${JSON.stringify(sampleKeyframe.ai_labels, null, 2)}`);
      console.log(`   - Source Info: ${JSON.stringify(sampleKeyframe.source_info, null, 2)}`);
    }

  } catch (error) {
    console.error('❌ Check failed:', error);
  }
}

checkKeyframes().catch(console.error);
