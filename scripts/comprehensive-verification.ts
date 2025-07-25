#!/usr/bin/env tsx

import { LanceDBIngestionService } from '../lib/lancedb-ingestion';

async function comprehensiveVerification() {
  console.log('🔍 Comprehensive verification of all content types...');

  const ingestionService = new LanceDBIngestionService();
  const lancedbUrl = process.env.LANCEDB_API_URL || 'http://lanced-LoadB-oFgwzoUCRPPr-1582930674.us-east-1.elb.amazonaws.com';

  try {
    // Step 1: Test search for all content types
    console.log('\n🎯 Step 1: Testing search for different content types...');
    const testQueries = [
      { query: 'HOMBRE', description: 'Audio search' },
      { query: 'Barry_dinner', description: 'Video search' },
      { query: 'chess', description: 'Keyframe search' },
      { query: 'casino', description: 'Mixed content search' },
      { query: 'timeline', description: 'Text search' }
    ];

    for (const test of testQueries) {
      console.log(`\n🔍 Testing: "${test.query}" (${test.description})`);

      // Test via LanceDBIngestionService
      const serviceResults = await ingestionService.search(test.query, 5);
      console.log(`   Service results: ${serviceResults?.length || 0}`);

      // Test via direct LanceDB API
      try {
        const response = await fetch(`${lancedbUrl}/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: test.query, limit: 5 })
        });

        if (response.ok) {
          const apiResults = await response.json();
          console.log(`   API results: ${apiResults.results?.length || 0}`);

          if (apiResults.results && apiResults.results.length > 0) {
            console.log('   Sample API results:');
            apiResults.results.slice(0, 3).forEach((result: any, index: number) => {
              console.log(`     ${index + 1}. ${result.title} (${result.content_type}) - Score: ${(result.score * 100).toFixed(1)}%`);
            });
          }
        } else {
          console.log(`   API failed: ${response.status}`);
        }
      } catch (error) {
        console.error(`   API error: ${error}`);
      }
    }

    // Step 2: Test specific content type filtering
    console.log('\n🎯 Step 2: Testing content type filtering...');
    const contentTypes = ['text', 'image', 'video', 'audio'];

    for (const contentType of contentTypes) {
      console.log(`\n🔍 Testing ${contentType} content...`);
      try {
        const response = await fetch(`${lancedbUrl}/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: 'test',
            limit: 10,
            content_types: [contentType]
          })
        });

        if (response.ok) {
          const results = await response.json();
          console.log(`   ${contentType} results: ${results.results?.length || 0}`);
          if (results.results && results.results.length > 0) {
            results.results.slice(0, 2).forEach((result: any, index: number) => {
              console.log(`     ${index + 1}. ${result.title} (${result.content_type})`);
            });
          }
        } else {
          console.log(`   ${contentType} failed: ${response.status}`);
        }
      } catch (error) {
        console.error(`   ${contentType} error: ${error}`);
      }
    }

    // Step 3: Test a known keyframe ID
    console.log('\n🎯 Step 3: Testing known keyframe ID...');
    const knownKeyframeId = 'a58bc96b-3444-4dd2-9328-bf0ee8963b45'; // From our ingestion

    try {
      const response = await fetch(`${lancedbUrl}/get/${knownKeyframeId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      console.log(`Response status: ${response.status}`);

      if (response.ok) {
        const result = await response.json();
        console.log(`✅ Found keyframe: ${result.title} (${result.content_type})`);
        console.log(`   - Has embedding: ${result.embedding ? 'Yes' : 'No'}`);
        if (result.embedding) {
          console.log(`   - Embedding length: ${result.embedding.length}`);
        }
      } else {
        const errorText = await response.text();
        console.error(`❌ Keyframe not found: ${errorText}`);
      }
    } catch (error) {
      console.error('Keyframe get error:', error);
    }

  } catch (error) {
    console.error('❌ Verification failed:', error);
  }
}

comprehensiveVerification().catch(console.error);
