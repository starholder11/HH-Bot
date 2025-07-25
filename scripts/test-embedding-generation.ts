#!/usr/bin/env tsx

import { LanceDBIngestionService } from '../lib/lancedb-ingestion';

async function testEmbeddingGeneration() {
  console.log('🧪 Testing embedding generation...');

  const ingestionService = new LanceDBIngestionService();

  try {
    // Test 1: Generate embedding for "barry_lyndon"
    console.log('\n📝 Test 1: Generating embedding for "barry_lyndon"');
    const barryEmbedding = await ingestionService.generateEmbedding('barry_lyndon');
    console.log('✅ Barry embedding generated:', barryEmbedding.length, 'dimensions');

    // Test 2: Generate embedding for "Hello World" content
    console.log('\n📝 Test 2: Generating embedding for "Hello World" content');
    const helloWorldText = `Welcome to Hyperreal Hospitality

This is a sample post to test the content management system.

About This Site

Hyperreal Hospitality is a retreat and sanctuary on the digital frontier, designed to educate, inform, entertain and guide people as they confront a future of AI and automation.

Content Coming Soon

We're preparing our knowledge base and content library. Stay tuned for more articles about the Starholder timeline and the possible futures of AI and automation.`;

    const helloEmbedding = await ingestionService.generateEmbedding(helloWorldText);
    console.log('✅ Hello World embedding generated:', helloEmbedding.length, 'dimensions');

    // Test 3: Calculate cosine similarity manually
    console.log('\n📊 Test 3: Calculating cosine similarity');
    const similarity = calculateCosineSimilarity(barryEmbedding, helloEmbedding);
    console.log('Cosine similarity between "barry_lyndon" and "Hello World":', similarity);

    // Test 4: Test with similar content
    console.log('\n📝 Test 4: Testing with similar content');
    const similarText = 'barry lyndon movie stanley kubrick';
    const similarEmbedding = await ingestionService.generateEmbedding(similarText);
    const similarSimilarity = calculateCosineSimilarity(barryEmbedding, similarEmbedding);
    console.log('Cosine similarity between "barry_lyndon" and "barry lyndon movie":', similarSimilarity);

  } catch (error) {
    console.error('❌ Test failed:', error);
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

  return dotProduct / (norm1 * norm2);
}

testEmbeddingGeneration().catch(console.error);
