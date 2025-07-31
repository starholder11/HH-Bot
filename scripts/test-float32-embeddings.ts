#!/usr/bin/env tsx

import { OpenAI } from 'openai';

// LanceDB service endpoint
const LANCEDB_API_URL = process.env.LANCEDB_API_URL ||
  'http://lanced-LoadB-oFgwzoUCRPPr-1582930674.us-east-1.elb.amazonaws.com';

async function testFloat32Embeddings() {
  console.log('🔍 Testing Float32Array Embeddings...');

  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY environment variable is required');
    process.exit(1);
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    // Step 1: Generate a test embedding
    console.log('\n🔍 Step 1: Generating test embedding...');
    const testEmbedding = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: 'almond al test',
    });

    const embedding = testEmbedding.data[0].embedding;
    console.log(`✅ Generated embedding: ${embedding.length} dimensions`);

    // Step 2: Test with regular array
    console.log('\n🔍 Step 2: Testing with regular array...');
    const regularRecord = {
      id: 'test-regular-array',
      content_type: 'text',
      title: 'Test Regular Array',
      content_text: 'This is a test with regular array embedding',
      references: {},
      metadata: { test: true }
    };

    const regularResponse = await fetch(`${LANCEDB_API_URL}/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(regularRecord)
    });

    if (regularResponse.ok) {
      console.log('✅ Regular array embedding ingested successfully');
    } else {
      const errorText = await regularResponse.text();
      console.log('❌ Regular array embedding failed:', errorText);
    }

    // Step 3: Test with Float32Array
    console.log('\n🔍 Step 3: Testing with Float32Array...');
    const float32Record = {
      id: 'test-float32-array',
      content_type: 'text',
      title: 'Test Float32Array',
      content_text: 'This is a test with Float32Array embedding',
      references: {},
      metadata: { test: true, embedding_type: 'Float32Array' }
    };

    const float32Response = await fetch(`${LANCEDB_API_URL}/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(float32Record)
    });

    if (float32Response.ok) {
      console.log('✅ Float32Array embedding ingested successfully');
    } else {
      const errorText = await float32Response.text();
      console.log('❌ Float32Array embedding failed:', errorText);
    }

    // Step 4: Test search functionality
    console.log('\n🔍 Step 4: Testing search functionality...');
    const searchResponse = await fetch(`${LANCEDB_API_URL}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'almond al test',
        limit: 5
      })
    });

    if (searchResponse.ok) {
      const searchResults = await searchResponse.json();
      console.log(`📋 Search returned ${searchResults.results.length} results`);

      // Check if our test records appear
      const testResults = searchResults.results.filter((r: any) =>
        r.id?.includes('test-')
      );

      if (testResults.length > 0) {
        console.log('✅ Test records found in search results');
        testResults.forEach((r: any, i: number) => {
          console.log(`  ${i + 1}. ${r.title} (score: ${r.score})`);
        });
      } else {
        console.log('❌ Test records NOT found in search results');
        console.log('💡 This suggests the vector search issue persists');
      }
    } else {
      const errorText = await searchResponse.text();
      console.log('❌ Search test failed:', errorText);
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testFloat32Embeddings().catch(console.error);
