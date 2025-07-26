#!/usr/bin/env tsx

import { OpenAI } from 'openai';

async function testAlmondSearchFix() {
  console.log('🧪 Testing Almond Search Fix...');

  try {
    // Test 1: Test embedding generation
    console.log('\n🧠 Test 1: Testing embedding generation...');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const queryText = 'almond al';
    const almondText = 'Almond Al reclined on his porch, a joint in one hand and a hot cup of tea in the other.';
    const irrelevantText = 'Hello world, this is a test message.';

    const queryEmbedding = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: queryText,
    });

    const almondEmbedding = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: almondText,
    });

    const irrelevantEmbedding = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: irrelevantText,
    });

    console.log('✅ Embeddings generated successfully');
    console.log(`Query embedding length: ${queryEmbedding.data[0].embedding.length}`);
    console.log(`Almond embedding length: ${almondEmbedding.data[0].embedding.length}`);
    console.log(`Irrelevant embedding length: ${irrelevantEmbedding.data[0].embedding.length}`);

    // Test 2: Calculate cosine similarities
    console.log('\n📐 Test 2: Calculating cosine similarities...');

    const almondSimilarity = calculateCosineSimilarity(
      queryEmbedding.data[0].embedding,
      almondEmbedding.data[0].embedding
    );

    const irrelevantSimilarity = calculateCosineSimilarity(
      queryEmbedding.data[0].embedding,
      irrelevantEmbedding.data[0].embedding
    );

    console.log(`Cosine similarity between "almond al" and almond content: ${almondSimilarity.toFixed(4)}`);
    console.log(`Cosine similarity between "almond al" and irrelevant content: ${irrelevantSimilarity.toFixed(4)}`);

    if (almondSimilarity > irrelevantSimilarity) {
      console.log('✅ Almond content is more similar (as expected)');
    } else {
      console.log('❌ Almond content is not more similar (unexpected)');
    }

    // Test 3: Test LanceDB search directly
    console.log('\n🔍 Test 3: Testing LanceDB search directly...');

    const lancedbUrl = 'http://lanced-LoadB-oFgwzoUCRPPr-1582930674.us-east-1.elb.amazonaws.com';

    const searchResponse = await fetch(`${lancedbUrl}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'almond al',
        limit: 10
      })
    });

    if (searchResponse.ok) {
      const searchResults = await searchResponse.json();
      console.log('LanceDB search results:');
      searchResults.results?.forEach((result: any, index: number) => {
        console.log(`${index + 1}. ${result.title} (${result.content_type}) - Score: ${(result.score * 100).toFixed(1)}%`);
      });

      // Check if almond files are in results
      const almondResults = searchResults.results?.filter((result: any) =>
        result.title.toLowerCase().includes('almond')
      );

      if (almondResults && almondResults.length > 0) {
        console.log(`✅ Found ${almondResults.length} almond results in LanceDB search`);
      } else {
        console.log('❌ No almond results found in LanceDB search');
      }
    } else {
      console.log('❌ LanceDB search failed:', searchResponse.status);
    }

    // Test 4: Test with different queries
    console.log('\n🔍 Test 4: Testing with different queries...');

    const testQueries = ['almond', 'al', 'betty', 'porch'];

    for (const query of testQueries) {
      console.log(`\nTesting query: "${query}"`);

      const response = await fetch(`${lancedbUrl}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          limit: 5
        })
      });

      if (response.ok) {
        const results = await response.json();
        console.log(`Results for "${query}":`);
        results.results?.slice(0, 3).forEach((result: any, index: number) => {
          console.log(`  ${index + 1}. ${result.title} - Score: ${(result.score * 100).toFixed(1)}%`);
        });
      }
    }

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

  if (norm1 === 0 || norm2 === 0) {
    return 0;
  }

  return dotProduct / (norm1 * norm2);
}

testAlmondSearchFix();
