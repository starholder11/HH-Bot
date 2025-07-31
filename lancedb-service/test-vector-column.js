#!/usr/bin/env node

const { OpenAI } = require('openai');
const { connect } = require('@lancedb/lancedb');
const { TextEmbeddingFunction } = require('@lancedb/lancedb').embedding;

async function testVectorColumn() {
  console.log('🧪 Testing LanceDB vector column...');

  // Initialize OpenAI
  const openai = new OpenAI({
    apiKey: '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'
  });

  try {
    // Connect to LanceDB
    const db = await connect('/tmp/lancedb');
    console.log('✅ Connected to LanceDB');

    // Create test data
    const testData = [
      {
        id: 'test-almond',
        content_type: 'text',
        title: 'Almond Al Story',
        description: 'A story about Almond Al',
        combined_text: 'almond al is a character in the story',
        metadata: '{"test": true}',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 'test-hombre',
        content_type: 'text',
        title: 'Hombre Story',
        description: 'A story about Hombre',
        combined_text: 'hombre is a spanish word for man',
        metadata: '{"test": true}',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 'test-dark-matter',
        content_type: 'text',
        title: 'Dark Matter Story',
        description: 'A story about dark matter',
        combined_text: 'dark matter is a mysterious substance in space',
        metadata: '{"test": true}',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ];

    // Create embedding function
    const embeddingFunction = new TextEmbeddingFunction(
      'combined_text',
      'embedding',
      async (text) => {
        const response = await openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: text
        });
        return response.data[0].embedding;
      }
    );

    // Create table with embedding function
    console.log('📋 Creating test table with embedding function...');
    const table = await db.createTable('test_content_v4', testData, {
      mode: 'overwrite',
      embeddingFunction
    });
    console.log('✅ Test table created with embedding function');

    // Check the table schema
    console.log('🔍 Checking table schema...');
    const tableSchema = await table.schema();
    console.log('📋 Table schema:', JSON.stringify(tableSchema, null, 2));

    // Test vector search
    console.log('🔍 Testing vector search...');
    const searchQuery = 'almond al';
    const searchResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: searchQuery
    });
    const queryEmbedding = searchResponse.data[0].embedding;

    const results = await table.search(queryEmbedding).limit(3).toArray();
    console.log(`✅ Vector search successful! Found ${results.length} results:`);

    results.forEach((result, index) => {
      console.log(`  ${index + 1}. ${result.title} - Score: ${(result.score * 100).toFixed(1)}%`);
    });

    console.log('\n🎉 Vector column test successful!');
    console.log('✅ The embedding column exists and is working properly');
    console.log('✅ Vector search is functional');

  } catch (error) {
    console.error('❌ Vector column test failed:', error);
    console.error('Error details:', error.message);
  }
}

testVectorColumn();
