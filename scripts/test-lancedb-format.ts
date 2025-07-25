#!/usr/bin/env tsx

import LanceDBIngestionService from '../lib/lancedb-ingestion';

async function testLanceDBFormat() {
  console.log('🔍 Testing LanceDB API format requirements...\n');

  const ingestionService = new LanceDBIngestionService();

  // Create a simple test record that should work
  const testRecord = {
    id: 'test_media_001',
    content_type: 'media' as const,
    title: 'Test Media',
    description: 'audio: test.mp3',
    combined_text: 'test audio music electronic sample',
    embedding: new Array(1536).fill(0.1), // Valid 1536-dimension embedding
    metadata: {
      media_type: 'audio',
      ai_labels: {
        scenes: [],
        objects: [],
        style: ['electronic'],
        mood: ['test'],
        themes: ['music']
      },
      analysis_completeness: {
        unique_terms_extracted: 5
      }
    },
    s3_url: 'https://s3.amazonaws.com/test/sample.mp3',
    cloudflare_url: 'https://cdn.test.com/sample.mp3',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  try {
    console.log('📤 Testing LanceDB API with simple record...');
    await ingestionService.addToLanceDB(testRecord);
    console.log('✅ Success! API format is correct.');

    // Test search to see if it appears
    console.log('🔍 Testing search for the new record...');
    const searchResults = await ingestionService.search('test electronic music', 3);
    console.log('Search results:', searchResults);

  } catch (error) {
    console.error('❌ API format error:', error);
    console.log('\n🔧 Debugging the record format:');
    console.log('Record structure:');
    console.log(JSON.stringify(testRecord, null, 2));
  }
}

testLanceDBFormat();
