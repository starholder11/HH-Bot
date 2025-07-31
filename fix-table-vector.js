const lancedb = require('@lancedb/lancedb');
const fs = require('fs');

const DIM = 1536;

async function fixTableVector() {
  try {
    console.log('🚀 Fixing table schema with vector column...');

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
      id: "test-embedding-vector",
      content_type: "text",
      title: "Test Vector Column",
      embedding: baseEmbedding, // Use the array directly
      searchable_text: "test content from vector column",
      content_hash: "test-hash-vector",
      last_updated: new Date().toISOString(),
      references: '{"content_url": "test-vector.com"}'
    };

    console.log('Creating table with vector column specification...');
    const table = await db.createTable('semantic_search', [record], {
      vectorColumn: 'embedding'
    });
    console.log('✅ Created table with vector column');

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

    console.log('🎉 SUCCESS! Vector column table works!');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

fixTableVector();
