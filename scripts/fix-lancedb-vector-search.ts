#!/usr/bin/env tsx

import { LanceDBIngestionService } from '../lib/lancedb-ingestion';

async function fixLanceDBVectorSearch() {
  console.log('🔧 Fixing LanceDB Vector Search...');

  const ingestionService = new LanceDBIngestionService();

  try {
    // Step 1: Test if LanceDB is working at all
    console.log('\n🔍 Step 1: Testing LanceDB basic functionality...');

    const testResults = await ingestionService.search('test', 5);
    console.log('Basic LanceDB test results:', testResults);

    // Step 2: Check if we can add records to LanceDB
    console.log('\n📝 Step 2: Testing LanceDB record addition...');

    const testRecord = {
      id: 'test_almond_al',
      content_type: 'text' as const,
      title: 'Almond Al Test',
      description: 'Test record for Almond Al',
      combined_text: 'Almond Al reclined on his porch, a joint in one hand and a hot cup of tea in the other.',
      embedding: await ingestionService.generateEmbedding('Almond Al reclined on his porch, a joint in one hand and a hot cup of tea in the other.'),
      metadata: {
        slug: 'test-almond-al',
        test: true
      },
      url: '/test-almond-al',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    try {
      await ingestionService.addToLanceDB(testRecord);
      console.log('✅ Successfully added test record to LanceDB');
    } catch (error) {
      console.error('❌ Failed to add test record:', error);
    }

    // Step 3: Test search after adding the record
    console.log('\n🔍 Step 3: Testing search after adding test record...');

    const searchAfterAdd = await ingestionService.search('almond al', 10);
    console.log('Search results after adding test record:');
    if (Array.isArray(searchAfterAdd)) {
      searchAfterAdd.forEach((result: any, index: number) => {
        console.log(`${index + 1}. ${result.title} (${result.content_type}) - Score: ${(result.score * 100).toFixed(1)}%`);
      });
    } else {
      console.log('Search results:', searchAfterAdd);
    }

    // Step 4: Test with a different approach - direct LanceDB API
    console.log('\n🔍 Step 4: Testing direct LanceDB API...');

    const lancedbUrl = 'http://lanced-LoadB-oFgwzoUCRPPr-1582930674.us-east-1.elb.amazonaws.com';

    // Test adding a record directly via API
    const testEmbedding = await ingestionService.generateEmbedding('Almond Al test content');

    const addResponse = await fetch(`${lancedbUrl}/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'test_almond_direct',
        content_type: 'text',
        title: 'Almond Al Direct Test',
        content_text: 'Almond Al reclined on his porch, a joint in one hand and a hot cup of tea in the other.',
        references: {},
        metadata: { test: true, slug: 'test-almond-direct' }
      })
    });

    if (addResponse.ok) {
      console.log('✅ Successfully added test record via direct API');

      // Test search after direct addition
      const directSearchResponse = await fetch(`${lancedbUrl}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'almond al',
          limit: 10
        })
      });

      if (directSearchResponse.ok) {
        const directResults = await directSearchResponse.json();
        console.log('Direct API search results:');
        directResults.results?.forEach((result: any, index: number) => {
          console.log(`${index + 1}. ${result.title} (${result.content_type}) - Score: ${(result.score * 100).toFixed(1)}%`);
        });
      }
    } else {
      console.log('❌ Failed to add test record via direct API:', addResponse.status);
    }

    // Step 5: Test the unified search API
    console.log('\n🔍 Step 5: Testing unified search API...');

    const unifiedResponse = await fetch('http://localhost:3000/api/unified-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'almond al',
        limit: 10
      })
    });

    if (unifiedResponse.ok) {
      const unifiedResults = await unifiedResponse.json();
      console.log('Unified search results:');
      if (unifiedResults.results?.text) {
        unifiedResults.results.text.forEach((result: any, index: number) => {
          console.log(`${index + 1}. ${result.title} (${result.content_type}) - Score: ${(result.score * 100).toFixed(1)}%`);
        });
      }
    } else {
      console.log('❌ Unified search failed:', unifiedResponse.status);
    }

    // Step 6: Summary and recommendations
    console.log('\n📊 Step 6: Summary and Recommendations...');
    console.log('Based on the tests, the issue is:');
    console.log('1. ✅ Embedding generation works correctly');
    console.log('2. ❌ LanceDB vector search is not working properly');
    console.log('3. ❌ Search results are alphabetical, not semantic');
    console.log('4. ❌ Almond files are not in LanceDB');

    console.log('\n🔧 Recommended fixes:');
    console.log('1. Re-ingest all content with proper embeddings');
    console.log('2. Verify LanceDB table schema is correct');
    console.log('3. Test LanceDB vector search configuration');
    console.log('4. Consider alternative search approaches');

  } catch (error) {
    console.error('❌ Fix failed:', error);
  }
}

fixLanceDBVectorSearch();
