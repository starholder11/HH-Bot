const lancedb = require('@lancedb/lancedb');
const fs = require('fs');

const DIM = 1536;

async function fixTableOverwrite() {
  try {
    console.log('🚀 Fixing table schema with overwrite mode...');

    // Connect to LanceDB directly
    const db = await lancedb.connect('/tmp/lancedb');
    console.log('✅ Connected to LanceDB');

    // Read the actual embedding from embedding.json
    const embeddingData = fs.readFileSync('embedding.json', 'utf8');
    const baseEmbedding = JSON.parse(embeddingData);

    console.log('Using embedding from embedding.json');
    console.log('Embedding length:', baseEmbedding.length);
    console.log('First 5 values:', baseEmbedding.slice(0, 5));

    // Create a record with the embedding
    const record = {
      id: "test-embedding-overwrite",
      content_type: "text",
      title: "Test Overwrite Mode",
      embedding: baseEmbedding, // Use the array directly
      searchable_text: "test content from overwrite mode",
      content_hash: "test-hash-overwrite",
      last_updated: new Date().toISOString(),
      references: '{"content_url": "test-overwrite.com"}'
    };

    console.log('Creating table with overwrite mode...');
    const table = await db.createTable('semantic_search', [record], {
      mode: 'overwrite',
      vectorColumn: 'embedding'
    });
    console.log('✅ Created table with overwrite mode');

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

    console.log('🎉 SUCCESS! Overwrite mode table works!');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

fixTableOverwrite();
