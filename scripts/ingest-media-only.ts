#!/usr/bin/env tsx

import { LanceDBIngestionService } from '../lib/lancedb-ingestion';

async function ingestMediaOnly() {
  console.log('🎬 Starting media-only ingestion to LanceDB...');

  const ingestionService = new LanceDBIngestionService();

  try {
    // Load and process media assets
    console.log('📁 Loading media assets from S3...');
    const mediaAssets = await ingestionService.loadMediaAssets();
    console.log(`✅ Found ${mediaAssets.length} media assets`);

    // Count by type
    const byType = mediaAssets.reduce((acc, asset) => {
      acc[asset.media_type] = (acc[asset.media_type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log('📊 Assets by type:');
    Object.entries(byType).forEach(([type, count]) => {
      console.log(`   - ${type}: ${count}`);
    });

    // Process and add each media asset
    console.log('\n📤 Processing and adding media assets to LanceDB...');
    let successCount = 0;
    let errorCount = 0;

    for (const asset of mediaAssets) {
      try {
        const record = await ingestionService.processMediaAsset(asset);
        await ingestionService.addToLanceDB(record);
        successCount++;
        console.log(`✅ Added: ${asset.title} (${asset.media_type})`);
      } catch (error) {
        errorCount++;
        console.error(`❌ Failed to process ${asset.title}:`, error);
      }
    }

    console.log(`\n🎉 Media ingestion complete!`);
    console.log(`✅ Successfully processed: ${successCount} assets`);
    console.log(`❌ Errors: ${errorCount} assets`);

    // Test search for HOMBRE specifically
    console.log('\n🧪 Testing HOMBRE search...');
    const searchResults = await ingestionService.search('HOMBRE', 5);
    console.log(`Search results for "HOMBRE": ${searchResults.length}`);

    if (searchResults.length > 0) {
      searchResults.forEach((result, index) => {
        console.log(`${index + 1}. ${result.title} (${result.content_type}) - Score: ${(result.score * 100).toFixed(1)}%`);
      });
    } else {
      console.log('❌ HOMBRE not found in search results');
    }

  } catch (error) {
    console.error('❌ Media ingestion failed:', error);
  }
}

ingestMediaOnly().catch(console.error);
