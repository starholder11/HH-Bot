#!/usr/bin/env tsx

import { LanceDBIngestionService } from '../lib/lancedb-ingestion';

async function debugLanceDBSemanticSearch() {
  console.log('🔍 Debugging LanceDB Semantic Search...');

  const ingestionService = new LanceDBIngestionService();

  try {
    // Test 1: Direct LanceDB search
    console.log('\n📊 Test 1: Direct LanceDB search for "almond al"...');
    const lancedbResults = await ingestionService.search('almond al', 10);

    console.log('LanceDB Results:');
    if (Array.isArray(lancedbResults)) {
      lancedbResults.forEach((result: any, index: number) => {
        console.log(`${index + 1}. ${result.title} (${result.content_type}) - Score: ${(result.score * 100).toFixed(1)}%`);
      });
    } else {
      console.log('LanceDB returned:', lancedbResults);
    }

    // Test 2: Check if almond files are in LanceDB
    console.log('\n📋 Test 2: Checking if almond files are in LanceDB...');
    const almondFiles = [
      'text_timeline/almond-als-joint/content',
      'text_timeline/almond-als-dream/content'
    ];

    for (const fileId of almondFiles) {
      try {
        const response = await fetch(`${process.env.LANCEDB_API_URL}/embeddings/${fileId}`);
        if (response.ok) {
          const record = await response.json();
          console.log(`✅ Found in LanceDB: ${fileId}`);
          console.log(`   Title: ${record.title}`);
          console.log(`   Content Type: ${record.content_type}`);
        } else {
          console.log(`❌ Not found in LanceDB: ${fileId}`);
        }
      } catch (error) {
        console.log(`❌ Error checking ${fileId}:`, error);
      }
    }

    // Test 3: Test with a simple query that should work
    console.log('\n🧪 Test 3: Testing with simple query "hello"...');
    const helloResults = await ingestionService.search('hello', 5);
    console.log('Hello search results:');
    if (Array.isArray(helloResults)) {
      helloResults.forEach((result: any, index: number) => {
        console.log(`${index + 1}. ${result.title} (${result.content_type}) - Score: ${(result.score * 100).toFixed(1)}%`);
      });
    }

    // Test 4: Check what's actually in the LanceDB table
    console.log('\n📋 Test 4: Listing all records in LanceDB...');
    try {
      const response = await fetch(`${process.env.LANCEDB_API_URL}/embeddings`);
      if (response.ok) {
        const data = await response.json();
        console.log(`Total records in LanceDB: ${data.total}`);
        console.log('Sample records:');
        data.records?.slice(0, 10).forEach((record: any, index: number) => {
          console.log(`${index + 1}. ${record.title} (${record.content_type})`);
        });
      } else {
        console.log('Failed to get records from LanceDB');
      }
    } catch (error) {
      console.log('Error getting records:', error);
    }

    // Test 5: Test embedding generation for almond content
    console.log('\n🧠 Test 5: Testing embedding generation...');
    const testText = "Almond Al reclined on his porch, a joint in one hand and a hot cup of tea in the other.";
    const embedding = await ingestionService.generateEmbedding(testText);
    console.log(`Generated embedding length: ${embedding.length}`);
    console.log(`First 5 values: [${embedding.slice(0, 5).join(', ')}]`);

    // Test 6: Test cosine similarity calculation
    console.log('\n📐 Test 6: Testing cosine similarity...');
    const queryEmbedding = await ingestionService.generateEmbedding('almond al');
    const contentEmbedding = await ingestionService.generateEmbedding(testText);

    const cosineSimilarity = calculateCosineSimilarity(queryEmbedding, contentEmbedding);
    console.log(`Cosine similarity between "almond al" and almond content: ${cosineSimilarity.toFixed(4)}`);

    // Test 7: Test with a different query
    console.log('\n🔍 Test 7: Testing with "betty" query...');
    const bettyResults = await ingestionService.search('betty', 5);
    console.log('Betty search results:');
    if (Array.isArray(bettyResults)) {
      bettyResults.forEach((result: any, index: number) => {
        console.log(`${index + 1}. ${result.title} (${result.content_type}) - Score: ${(result.score * 100).toFixed(1)}%`);
      });
    }

  } catch (error) {
    console.error('❌ Debug failed:', error);
  }
}

function calculateCosineSimilarity(vec1: number[], vec2: number[]): number {
  if (vec1.length !== vec2.length) {
    throw new Error('Vectors must have same length');
  }

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    norm1 += vec1[i] * vec1[i];
    norm2 += vec2[i] * vec2[i];
  }

  norm1 = Math.sqrt(norm1);
  norm2 = Math.sqrt(norm2);

  if (norm1 === 0 || norm2 === 0) {
    return 0;
  }

  return dotProduct / (norm1 * norm2);
}

debugLanceDBSemanticSearch();
