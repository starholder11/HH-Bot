#!/usr/bin/env tsx

import { LanceDBIngestionService } from '../lib/lancedb-ingestion';

async function testKeyframeSearch() {
  console.log('🔍 Testing keyframe search functionality...');

  const ingestionService = new LanceDBIngestionService();

  try {
    // Step 1: Test search for "chess" (should find keyframes)
    console.log('\n🎯 Step 1: Testing search for "chess"...');
    const chessResults = await ingestionService.search('chess', 5);
    console.log(`Found ${chessResults?.length || 0} results for "chess"`);

    if (chessResults && chessResults.length > 0) {
      chessResults.forEach((result, index) => {
        console.log(`  ${index + 1}. ${result.title} (${result.content_type}) - Score: ${(result.score * 100).toFixed(1)}%`);
      });
    }

    // Step 2: Test search for "casino" (should find keyframes)
    console.log('\n🎯 Step 2: Testing search for "casino"...');
    const casinoResults = await ingestionService.search('casino', 5);
    console.log(`Found ${casinoResults?.length || 0} results for "casino"`);

    if (casinoResults && casinoResults.length > 0) {
      casinoResults.forEach((result, index) => {
        console.log(`  ${index + 1}. ${result.title} (${result.content_type}) - Score: ${(result.score * 100).toFixed(1)}%`);
      });
    }

    // Step 3: Test LanceDB directly
    console.log('\n🎯 Step 3: Testing LanceDB directly...');
    const lancedbUrl = process.env.LANCEDB_API_URL || 'http://lanced-LoadB-oFgwzoUCRPPr-1582930674.us-east-1.elb.amazonaws.com';

    try {
      const response = await fetch(`${lancedbUrl}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'chess', limit: 5 })
      });

      if (response.ok) {
        const results = await response.json();
        console.log(`LanceDB search for "chess": ${results.length} results`);
        if (results.length > 0) {
          results.slice(0, 3).forEach((result: any, index: number) => {
            console.log(`  ${index + 1}. ${result.title} (${result.content_type}) - Score: ${(result.score * 100).toFixed(1)}%`);
          });
        }
      } else {
        console.log(`LanceDB search failed: ${response.status}`);
      }
    } catch (error) {
      console.error('LanceDB search error:', error);
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testKeyframeSearch().catch(console.error);
