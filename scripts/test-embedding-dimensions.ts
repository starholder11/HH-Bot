#!/usr/bin/env tsx

import { OpenAI } from 'openai';

async function testEmbeddingDimensions() {
  console.log('🔍 Testing embedding dimensions...\n');

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // Test text embedding
  console.log('📝 Testing text embedding...');
  const textResponse = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: 'Hello World text content',
  });
  console.log('Text embedding dimensions:', textResponse.data[0].embedding.length);

  // Test video content embedding
  console.log('🎬 Testing video content embedding...');
  const videoText = 'Barry dinner video casual dining restaurant scene food eating indoor kitchen';
  const videoResponse = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: videoText,
  });
  console.log('Video embedding dimensions:', videoResponse.data[0].embedding.length);

  // Test if they're the same
  if (textResponse.data[0].embedding.length === videoResponse.data[0].embedding.length) {
    console.log('✅ Embedding dimensions match');
  } else {
    console.log('❌ Embedding dimensions mismatch!');
  }

  // Test LanceDB search with different embeddings
  const lancedbUrl = 'http://lanced-LoadB-oFgwzoUCRPPr-1582930674.us-east-1.elb.amazonaws.com';

  console.log('\n🔍 Testing LanceDB search with text embedding...');
  const textSearchResponse = await fetch(`${lancedbUrl}/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: 'Hello World',
      limit: 10
    }),
  });
  const textSearchResult = await textSearchResponse.json();
  console.log('Text search results:', textSearchResult.results?.length || 0);
  console.log('Content types:', Array.from(new Set(textSearchResult.results?.map((r: any) => r.content_type) || [])));

  console.log('\n🔍 Testing LanceDB search with video content...');
  const videoSearchResponse = await fetch(`${lancedbUrl}/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: 'Barry dinner video',
      limit: 10
    }),
  });
  const videoSearchResult = await videoSearchResponse.json();
  console.log('Video search results:', videoSearchResult.results?.length || 0);
  console.log('Content types:', Array.from(new Set(videoSearchResult.results?.map((r: any) => r.content_type) || [])));

  // Check if there's a pattern - maybe video embeddings are being stored differently
  console.log('\n🎯 Testing if video records exist but aren't being returned...');

  // Add a video record with explicit embedding
  const videoEmbedding = videoResponse.data[0].embedding;
  console.log('Adding video record with explicit embedding...');

  const addResponse = await fetch(`${lancedbUrl}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id: 'embedding_test_video',
      content_type: 'video',
      title: 'Embedding Test Video',
      content_text: videoText,
      references: { s3_url: 'test' },
      metadata: { test: true, media_type: 'video' }
    }),
  });

  const addResult = await addResponse.json();
  console.log('Add result:', addResult);

  if (addResult.success) {
    // Wait and search
    await new Promise(resolve => setTimeout(resolve, 3000));

    const finalSearchResponse = await fetch(`${lancedbUrl}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: 'Barry dinner video',
        limit: 20
      }),
    });

    const finalSearchResult = await finalSearchResponse.json();
    const ourVideo = finalSearchResult.results?.find((r: any) => r.id === 'embedding_test_video');

    if (ourVideo) {
      console.log('🎉 SUCCESS: Video record found in search!');
      console.log('Video record:', ourVideo);
    } else {
      console.log('❌ Video record still not found in search');
      console.log('This suggests a fundamental issue with vector search for non-text content');
    }
  }
}

testEmbeddingDimensions().catch(console.error);
