#!/usr/bin/env tsx

import { LanceDBIngestionService } from '../lib/lancedb-ingestion';

async function comprehensiveSearchTest() {
  console.log('🔍 Starting COMPREHENSIVE search test...');

  const ingestionService = new LanceDBIngestionService();

  try {
    // Step 1: Load all data from JSON sources
    console.log('\n📁 Step 1: Loading all data from JSON sources...');
    const mediaAssets = await ingestionService.loadMediaAssets();
    console.log(`✅ Loaded ${mediaAssets.length} media assets from JSON`);

    const byType = mediaAssets.reduce((acc, asset) => {
      acc[asset.media_type] = (acc[asset.media_type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log('📊 JSON Assets by type:');
    Object.entries(byType).forEach(([type, count]) => {
      console.log(`   - ${type}: ${count}`);
    });

    // Step 2: Test LanceDB search directly
    console.log('\n🔍 Step 2: Testing LanceDB search directly...');
    const lancedbUrl = process.env.LANCEDB_API_URL || 'http://lanced-LoadB-oFgwzoUCRPPr-1582930674.us-east-1.elb.amazonaws.com';

    const testQueries = [
      { query: 'HOMBRE', description: 'Audio search' },
      { query: 'Barry_dinner', description: 'Video search' },
      { query: 'chess', description: 'Keyframe search' },
      { query: 'casino', description: 'Mixed content search' },
      { query: 'timeline', description: 'Text search' }
    ];

    for (const test of testQueries) {
      console.log(`\n🔍 Testing: "${test.query}" (${test.description})`);

      try {
        const response = await fetch(`${lancedbUrl}/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: test.query,
            limit: 10,
            content_types: ['text', 'image', 'video', 'audio']
          })
        });

        if (response.ok) {
          const data = await response.json();
          console.log(`   LanceDB Results: ${data.results?.length || 0}`);
          if (data.results && data.results.length > 0) {
            data.results.slice(0, 3).forEach((result: any, index: number) => {
              console.log(`   ${index + 1}. ${result.title} (${result.content_type}) - Score: ${(result.score * 100).toFixed(1)}%`);
            });
          }
        } else {
          console.log(`   ❌ LanceDB Error: ${response.status} ${response.statusText}`);
        }
      } catch (error) {
        console.log(`   ❌ LanceDB Error: ${error}`);
      }
    }

    // Step 3: Test our unified search API
    console.log('\n🔍 Step 3: Testing unified search API...');
    for (const test of testQueries) {
      console.log(`\n🔍 Testing: "${test.query}" (${test.description})`);

      try {
        const searchResults = await ingestionService.search(test.query, 10);
        console.log(`   Unified API Results: ${searchResults?.length || 0}`);
        if (searchResults && searchResults.length > 0) {
          searchResults.slice(0, 3).forEach((result: any, index: number) => {
            console.log(`   ${index + 1}. ${result.title} (${result.content_type}) - Score: ${(result.score * 100).toFixed(1)}%`);
          });
        } else {
          console.log(`   ❌ No results from unified API`);
        }
      } catch (error) {
        console.log(`   ❌ Unified API Error: ${error}`);
      }
    }

    // Step 4: Test JSON matching for specific queries
    console.log('\n🔍 Step 4: Testing JSON matching for specific queries...');

    // Test HOMBRE in JSON
    const hombreMatches = mediaAssets.filter(asset =>
      asset.title.toLowerCase().includes('hombre') ||
      asset.filename.toLowerCase().includes('hombre')
    );
    console.log(`\n🎵 HOMBRE matches in JSON: ${hombreMatches.length}`);
    hombreMatches.forEach(asset => {
      console.log(`   - "${asset.title}" (${asset.filename}) - ${asset.media_type}`);
    });

    // Test chess in keyframes
    const chessKeyframes = mediaAssets.filter(asset =>
      asset.media_type === 'keyframe_still' &&
      (asset.title.toLowerCase().includes('chess') ||
       asset.ai_labels?.scenes?.some(scene => scene.toLowerCase().includes('chess')) ||
       asset.ai_labels?.objects?.some(obj => obj.toLowerCase().includes('chess')))
    );
    console.log(`\n♟️ Chess keyframes in JSON: ${chessKeyframes.length}`);
    chessKeyframes.slice(0, 3).forEach(asset => {
      console.log(`   - "${asset.title}" - Scenes: ${asset.ai_labels?.scenes?.slice(0, 2).join(', ')}`);
    });

    // Test Barry_dinner in videos
    const barryMatches = mediaAssets.filter(asset =>
      asset.media_type === 'video' &&
      (asset.title.toLowerCase().includes('barry') ||
       asset.filename.toLowerCase().includes('barry'))
    );
    console.log(`\n🎬 Barry matches in JSON: ${barryMatches.length}`);
    barryMatches.forEach(asset => {
      console.log(`   - "${asset.title}" (${asset.filename})`);
    });

    // Step 5: Verify data integrity
    console.log('\n📊 Step 5: Data integrity verification...');
    console.log(`   - Total assets loaded: ${mediaAssets.length}`);
    console.log(`   - Audio assets: ${mediaAssets.filter(a => a.media_type === 'audio').length}`);
    console.log(`   - Video assets: ${mediaAssets.filter(a => a.media_type === 'video').length}`);
    console.log(`   - Image assets: ${mediaAssets.filter(a => a.media_type === 'image').length}`);
    console.log(`   - Keyframe assets: ${mediaAssets.filter(a => a.media_type === 'keyframe_still').length}`);

    // Check for assets with rich metadata
    const assetsWithRichMetadata = mediaAssets.filter(asset =>
      asset.ai_labels &&
      (asset.ai_labels.scenes?.length > 0 ||
       asset.ai_labels.objects?.length > 0 ||
       asset.ai_labels.style?.length > 0)
    );
    console.log(`   - Assets with rich AI metadata: ${assetsWithRichMetadata.length}`);

    console.log('\n✅ Comprehensive search test complete!');

  } catch (error) {
    console.error('❌ Comprehensive search test failed:', error);
  }
}

comprehensiveSearchTest().catch(console.error);
