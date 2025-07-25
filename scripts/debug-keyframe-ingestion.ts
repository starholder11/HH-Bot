#!/usr/bin/env tsx

import { LanceDBIngestionService } from '../lib/lancedb-ingestion';

async function debugKeyframeIngestion() {
  console.log('🔍 Debugging keyframe ingestion...');

  const ingestionService = new LanceDBIngestionService();

  try {
    // Step 1: Load a single keyframe
    console.log('\n📁 Step 1: Loading a single keyframe...');
    const { listMediaAssets } = await import('../lib/media-storage');

    const mediaResult = await listMediaAssets(undefined, {
      loadAll: true,
      excludeKeyframes: false
    });

    const keyframes = mediaResult.assets.filter(asset => asset.media_type === 'keyframe_still');
    console.log(`✅ Found ${keyframes.length} keyframes`);

    if (keyframes.length === 0) {
      console.log('❌ No keyframes found');
      return;
    }

    // Step 2: Process a single keyframe
    const testKeyframe = keyframes[0];
    console.log('\n🎬 Step 2: Processing keyframe:', testKeyframe.title);
    console.log('Keyframe metadata:');
    console.log(`   - ID: ${testKeyframe.id}`);
    console.log(`   - Media Type: ${testKeyframe.media_type}`);
    console.log(`   - Title: ${testKeyframe.title}`);
    console.log(`   - AI Labels: ${JSON.stringify(testKeyframe.ai_labels, null, 2)}`);

    // Step 3: Process the keyframe for LanceDB
    console.log('\n📤 Step 3: Processing keyframe for LanceDB...');
    const record = await ingestionService.processMediaAsset(testKeyframe);

    console.log('Processed record:');
    console.log(`   - ID: ${record.id}`);
    console.log(`   - Content Type: ${record.content_type}`);
    console.log(`   - Title: ${record.title}`);
    console.log(`   - Combined Text Length: ${record.combined_text.length}`);
    console.log(`   - Embedding Length: ${record.embedding.length}`);
    console.log(`   - Metadata: ${JSON.stringify(record.metadata, null, 2)}`);

    // Step 4: Test JSON serialization
    console.log('\n🔍 Step 4: Testing JSON serialization...');
    try {
      const jsonString = JSON.stringify(record);
      console.log(`✅ JSON serialization successful (${jsonString.length} chars)`);
      console.log('First 500 chars:', jsonString.substring(0, 500));
    } catch (error) {
      console.error('❌ JSON serialization failed:', error);
      return;
    }

    // Step 5: Try to add to LanceDB
    console.log('\n💾 Step 5: Adding to LanceDB...');
    try {
      await ingestionService.addToLanceDB(record);
      console.log('✅ Successfully added to LanceDB!');
    } catch (error) {
      console.error('❌ Failed to add to LanceDB:', error);

      // Log the full error details
      if (error instanceof Error) {
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
      }
    }

  } catch (error) {
    console.error('❌ Debug failed:', error);
  }
}

debugKeyframeIngestion().catch(console.error);
