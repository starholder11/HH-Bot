#!/usr/bin/env node

const lancedb = require('@lancedb/lancedb');
const fs = require('fs');

const DIM = 1536;

async function testVectorColumn() {
  try {
    console.log('🚀 Testing LanceDB with vector column specification...');

    // Connect to LanceDB directly
    const db = await lancedb.connect('/tmp/lancedb');
    console.log('✅ Connected to LanceDB');

    // Drop existing table to start fresh
    try {
      await db.dropTable('semantic_search');
      console.log('🗑️ Dropped existing table');
    } catch (error) {
      console.log('ℹ️ No existing table to drop');
    }

    // Read the actual embedding from embedding.json
    const embeddingData = fs.readFileSync('embedding.json', 'utf8');
    const baseEmbedding = JSON.parse(embeddingData);

    console.log('Using embedding from embedding.json');
    console.log('Embedding length:', baseEmbedding.length);
    console.log('First 5 values:', baseEmbedding.slice(0, 5));

    // Create 300 rows of data
    const data = [];
    for (let i = 0; i < 300; i++) {
      // Create slight variations of the base embedding
      const embedding = baseEmbedding.map(val => val + (Math.random() - 0.5) * 0.01);

      data.push({
        id: `test-row-${i}`,
        content_type: 'text',
        title: `Test Row ${i}`,
        embedding: embedding,
        searchable_text: `test content for row ${i}`,
        content_hash: `test-hash-${i}`,
        last_updated: new Date().toISOString(),
        references: `{"content_url": "test-${i}.com"}`
      });
    }

    console.log(`Creating table with ${data.length} rows and vector column...`);

    // Create table with vector column specification
    const table = await db.createTable('semantic_search', data, {
      vectorColumn: 'embedding'
    });
    console.log('✅ Created table with vector column');

    // Check count
    const count = await table.countRows();
    console.log(`✅ Table has ${count} rows`);

    // Create vector index
    console.log('Creating vector index...');
    await table.createIndex('embedding');
    console.log('✅ Created vector index');

    // Try vector search
    console.log('Testing vector search...');
    const searchEmbedding = baseEmbedding;
    const results = await table.vectorSearch(searchEmbedding).limit(5).toArray();
    console.log(`✅ Vector search found ${results.length} results`);

    results.forEach((result, index) => {
      console.log(`  ${index + 1}. ${result.id} - Score: ${result.score || 'N/A'}`);
    });

    console.log('🎉 SUCCESS! LanceDB vector search is working!');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testVectorColumn();
