const lancedb = require('@lancedb/lancedb');
const fs = require('fs');

const DIM = 1536;

async function fixTableSchema() {
  try {
    console.log('🚀 Fixing table schema...');

    // Connect to LanceDB directly
    const db = await lancedb.connect('/tmp/lancedb');
    console.log('✅ Connected to LanceDB');

    // Drop existing table
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

    // Create a record with the embedding
    const record = {
      id: "test-embedding-fixed",
      content_type: "text",
      title: "Test Fixed Schema",
      embedding: baseEmbedding, // Use the array directly
      searchable_text: "test content from fixed schema",
      content_hash: "test-hash-fixed",
      last_updated: new Date().toISOString(),
      references: '{"content_url": "test-fixed.com"}'
    };

    console.log('Creating table with correct data...');
    const table = await db.createTable('semantic_search', [record]);
    console.log('✅ Created table with correct data');

    // Check count
    const count = await table.countRows();
    console.log(`✅ Table has ${count} rows`);

    // Get schema to verify
    const schema = await table.schema();
    console.log('Table schema:', schema.toString());

    // Test search
    console.log('Testing search...');
    const results = await table.vectorSearch(baseEmbedding).limit(5).toArray();
    console.log(`✅ Search found ${results.length} results`);

    results.forEach((result, index) => {
      console.log(`  ${index + 1}. ${result.id} - Score: ${result.score || 'N/A'}`);
    });

    console.log('🎉 SUCCESS! Table schema is now fixed!');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

fixTableSchema();
