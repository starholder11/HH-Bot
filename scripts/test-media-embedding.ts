#!/usr/bin/env tsx

import { OpenAI } from 'openai';

async function testMediaEmbedding() {
  console.log('🔍 Testing manual media embedding...\n');

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // Generate embedding for a simple media asset
  const testText = 'Barry dinner video casual dining restaurant scene food eating indoor kitchen';
  console.log('📝 Text to embed:', testText);

  const embedding = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: testText,
  });

  const lancedbUrl = 'http://lanced-LoadB-oFgwzoUCRPPr-1582930674.us-east-1.elb.amazonaws.com';

  // Create test record
  const testRecord = {
    id: 'manual_test_barry_dinner',
    content_type: 'video',
    title: 'Barry_dinner_manual_test',
    content_text: testText,
    references: {
      s3_url: 'https://s3.amazonaws.com/test/barry.mp4',
      cloudflare_url: 'https://cdn.test.com/barry.mp4'
    },
    metadata: {
      media_type: 'video',
      ai_labels: {
        scenes: ['dining', 'restaurant'],
        objects: ['food', 'table', 'person'],
        style: ['casual', 'indoor'],
        mood: ['relaxed'],
        themes: ['food', 'dining']
      }
    }
  };

  console.log('📤 Adding test record to LanceDB...');
  const response = await fetch(`${lancedbUrl}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(testRecord),
  });

  if (!response.ok) {
    throw new Error(`LanceDB API error: ${response.statusText}`);
  }

  console.log('✅ Test record added successfully');

  // Wait a moment for indexing
  console.log('⏳ Waiting 3 seconds for indexing...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Test search
  console.log('🔍 Searching for the test record...');
  const searchResponse = await fetch(`${lancedbUrl}/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: 'Barry dinner video',
      limit: 10
    }),
  });

  const searchResults = await searchResponse.json();
  console.log('📋 Search results:');
  console.log(JSON.stringify(searchResults, null, 2));

  // Look for our test record
  const found = searchResults.results?.find((r: any) => r.id === 'manual_test_barry_dinner');
  if (found) {
    console.log('🎉 SUCCESS: Test media record found in search results!');
    console.log(`   Title: ${found.title}`);
    console.log(`   Content type: ${found.content_type}`);
    console.log(`   Score: ${(found.score * 100).toFixed(1)}%`);
  } else {
    console.log('❌ FAILED: Test media record not found in search results');
    console.log('   This suggests an issue with LanceDB indexing or search');
  }
}

testMediaEmbedding().catch(console.error);
