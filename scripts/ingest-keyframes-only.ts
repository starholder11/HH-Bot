#!/usr/bin/env tsx

import './bootstrap-env';
import { LanceDBIngestionService } from '../lib/lancedb-ingestion-backup';

async function ingestKeyframesOnly() {
  console.log('🎞️ Starting KEYFRAMES-ONLY ingestion to LanceDB...');

  const ingestionService = new LanceDBIngestionService();

  try {
    // Load ALL media assets (including keyframes)
    console.log('📁 Loading ALL media assets (with keyframes)...');
    const { listMediaAssets } = await import('../lib/media-storage');

    const mediaResult = await listMediaAssets(undefined, {
      loadAll: true,
      excludeKeyframes: false // INCLUDE keyframes this time
    });

    const allAssets = mediaResult.assets;
    const keyframes = allAssets.filter(asset => asset.media_type === 'keyframe_still');

    console.log(`✅ Found ${allAssets.length} total assets`);
    console.log(`🎞️ Found ${keyframes.length} keyframes to ingest`);

    if (keyframes.length === 0) {
      console.log('❌ No keyframes found');
      return;
    }

    // Process and add each keyframe
    console.log('\n📤 Processing and adding keyframes to LanceDB...');
    let successCount = 0;
    let errorCount = 0;

    for (const keyframe of keyframes) {
      try {
        const record = await ingestionService.processMediaAsset(keyframe);
        await ingestionService.addToLanceDB(record);
        successCount++;

        // Log progress every 50 items
        if (successCount % 50 === 0) {
          console.log(`✅ Processed ${successCount}/${keyframes.length} keyframes...`);
        }
      } catch (error) {
        errorCount++;
        console.error(`❌ Failed to process ${keyframe.title}:`, error);
      }
    }

    console.log(`\n🎉 Keyframe ingestion complete!`);
    console.log(`✅ Successfully processed: ${successCount} keyframes`);
    console.log(`❌ Errors: ${errorCount} keyframes`);

  } catch (error) {
    console.error('❌ Keyframe ingestion failed:', error);
    throw error;
  }
}

// Run the script
ingestKeyframesOnly().catch(console.error);
