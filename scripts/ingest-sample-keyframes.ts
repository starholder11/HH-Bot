#!/usr/bin/env tsx

import { LanceDBIngestionService } from '../lib/lancedb-ingestion';

async function ingestSampleKeyframes() {
  console.log('🔍 Ingesting sample keyframes...');

  const ingestionService = new LanceDBIngestionService();

  try {
    // Step 1: Load keyframes
    console.log('\n📁 Step 1: Loading keyframes...');
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

    // Step 2: Ingest first 5 keyframes
    console.log('\n📤 Step 2: Ingesting first 5 keyframes...');
    const sampleKeyframes = keyframes.slice(0, 5);

    let successCount = 0;
    let errorCount = 0;

    for (const keyframe of sampleKeyframes) {
      try {
        console.log(`Processing: ${keyframe.title}`);
        const record = await ingestionService.processMediaAsset(keyframe);
        await ingestionService.addToLanceDB(record);
        successCount++;
        console.log(`✅ Added: ${keyframe.title}`);
      } catch (error) {
        errorCount++;
        console.error(`❌ Failed: ${keyframe.title} - ${error}`);
      }
    }

    console.log(`\n🎉 Sample ingestion complete!`);
    console.log(`✅ Successfully processed: ${successCount} keyframes`);
    console.log(`❌ Errors: ${errorCount} keyframes`);

    // Step 3: Test search
    console.log('\n🧪 Step 3: Testing search...');
    const searchResults = await ingestionService.search('chess', 5);
    console.log(`Search results for "chess": ${searchResults?.length || 0}`);

    if (searchResults && searchResults.length > 0) {
      searchResults.forEach((result, index) => {
        console.log(`  ${index + 1}. ${result.title} (${result.content_type}) - Score: ${(result.score * 100).toFixed(1)}%`);
      });
    }

  } catch (error) {
    console.error('❌ Ingest failed:', error);
  }
}

ingestSampleKeyframes().catch(console.error);
