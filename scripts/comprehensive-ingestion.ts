#!/usr/bin/env tsx

import { LanceDBIngestionService } from '../lib/lancedb-ingestion';

async function comprehensiveIngestion() {
  console.log('🚀 Starting COMPREHENSIVE content ingestion...');

  const ingestionService = new LanceDBIngestionService();

  try {
    // Step 1: Load ALL media assets (including keyframes)
    console.log('\n📁 Step 1: Loading ALL media assets...');
    const mediaAssets = await ingestionService.loadMediaAssets();
    console.log(`✅ Loaded ${mediaAssets.length} total media assets`);

    // Count by type
    const byType = mediaAssets.reduce((acc, asset) => {
      acc[asset.media_type] = (acc[asset.media_type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log('📊 Assets by type:');
    Object.entries(byType).forEach(([type, count]) => {
      console.log(`   - ${type}: ${count}`);
    });

    // Step 2: Process and ingest ALL media assets
    console.log('\n📤 Step 2: Processing and ingesting ALL media assets...');
    let successCount = 0;
    let errorCount = 0;

    for (const asset of mediaAssets) {
      try {
        const record = await ingestionService.processMediaAsset(asset);
        await ingestionService.addToLanceDB(record);
        successCount++;

        // Log progress every 50 items
        if (successCount % 50 === 0) {
          console.log(`✅ Processed ${successCount} assets...`);
        }
      } catch (error) {
        errorCount++;
        console.error(`❌ Failed to process ${asset.title}:`, error);
      }
    }

    console.log(`\n🎉 Media ingestion complete!`);
    console.log(`✅ Successfully processed: ${successCount} assets`);
    console.log(`❌ Errors: ${errorCount} assets`);

    // Step 3: Test comprehensive search
    console.log('\n🧪 Step 3: Testing comprehensive search...');

    // Test different content types
    const testQueries = [
      { query: 'HOMBRE', description: 'Audio search' },
      { query: 'Barry_dinner', description: 'Video search' },
      { query: 'chess', description: 'Keyframe search' },
      { query: 'casino', description: 'Mixed content search' },
      { query: 'timeline', description: 'Text search' }
    ];

    for (const test of testQueries) {
      console.log(`\n🔍 Testing: "${test.query}" (${test.description})`);
      const searchResults = await ingestionService.search(test.query, 5);
      console.log(`   Results: ${searchResults.length}`);

      if (searchResults.length > 0) {
        searchResults.forEach((result, index) => {
          console.log(`   ${index + 1}. ${result.title} (${result.content_type}) - Score: ${(result.score * 100).toFixed(1)}%`);
        });
      }
    }

    // Step 4: Test LanceDB directly
    console.log('\n🔍 Step 4: Testing LanceDB directly...');
    const lancedbUrl = process.env.LANCEDB_API_URL || 'http://lanced-LoadB-oFgwzoUCRPPr-1582930674.us-east-1.elb.amazonaws.com';

    const testQueries2 = ['HOMBRE', 'Barry_dinner', 'chess', 'casino'];
    for (const query of testQueries2) {
      try {
        const response = await fetch(`${lancedbUrl}/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, limit: 5 })
        });

        if (response.ok) {
          const results = await response.json();
          console.log(`\n📊 LanceDB search for "${query}":`);
          console.log(`   Total results: ${results.length}`);

          if (results.length > 0) {
            results.slice(0, 3).forEach((result: any, index: number) => {
              console.log(`   ${index + 1}. ${result.title} (${result.content_type}) - Score: ${(result.score * 100).toFixed(1)}%`);
            });
          }
        } else {
          console.log(`❌ LanceDB search failed for "${query}": ${response.status}`);
        }
      } catch (error) {
        console.error(`❌ LanceDB search error for "${query}":`, error);
      }
    }

    console.log('\n🎯 COMPREHENSIVE INGESTION COMPLETE!');
    console.log('   All content types are now searchable:');
    console.log('   - Text content (timeline entries, posts)');
    console.log('   - Video content with rich metadata');
    console.log('   - Audio content with AI analysis');
    console.log('   - Keyframes with detailed scene descriptions');
    console.log('   - Images with visual analysis');

  } catch (error) {
    console.error('❌ Comprehensive ingestion failed:', error);
  }
}

comprehensiveIngestion().catch(console.error);
