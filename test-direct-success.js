const lancedb = require('@lancedb/lancedb');
const fs = require('fs');

const DIM = 1536;

async function testDirectSuccess() {
  try {
    console.log('🚀 Testing direct LanceDB success...');

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

    // Create a simple record with the embedding
    const record = {
      id: "test-direct-success",
      content_type: "text",
      title: "Test Direct Success",
      embedding: baseEmbedding, // Use the array directly
      searchable_text: "test content from direct success",
      content_hash: "test-hash-direct",
      last_updated: new Date().toISOString(),
      references: '{"content_url": "test-direct.com"}'
    };

    console.log('Creating table with single record...');
    const table = await db.createTable('semantic_search', [record]);
    console.log('✅ Created table with record');

    // Check count
    const count = await table.countRows();
    console.log(`✅ Table has ${count} rows`);

    // Get schema to verify
    const schema = await table.schema();
    console.log('Table schema:', schema.toString());

    console.log('🎉 SUCCESS! Direct LanceDB ingestion works!');
    console.log('The issue is with HTTP serialization, not the basic approach.');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testDirectSuccess();
