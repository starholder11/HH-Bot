const lancedb = require('@lancedb/lancedb');
const fs = require('fs');

const DIM = 1536;

async function addEmbeddingDirect() {
  try {
    console.log('🚀 Adding embedding directly to LanceDB...');

    // Connect to LanceDB directly
    const db = await lancedb.connect('/tmp/lancedb');
    console.log('✅ Connected to LanceDB');

    // Open existing table
    const table = await db.openTable('semantic_search');
    console.log('✅ Opened existing table');

    // Read the actual embedding from embedding.json
    const embeddingData = fs.readFileSync('embedding.json', 'utf8');
    const baseEmbedding = JSON.parse(embeddingData);

    console.log('Using embedding from embedding.json');
    console.log('Embedding length:', baseEmbedding.length);
    console.log('First 5 values:', baseEmbedding.slice(0, 5));

    // Create a record with the embedding
    const record = {
      id: "test-embedding-direct",
      content_type: "text",
      title: "Test Direct Embedding",
      embedding: baseEmbedding, // Use the array directly
      searchable_text: "test content from direct embedding",
      content_hash: "test-hash-direct",
      last_updated: new Date().toISOString(),
      references: '{"content_url": "test-direct.com"}'
    };

    console.log('Adding record to existing table...');
    await table.add([record]);
    console.log('✅ Added record to table');

    // Check count
    const count = await table.countRows();
    console.log(`✅ Table now has ${count} rows`);

    // Test search
    console.log('Testing search...');
    const results = await table.vectorSearch(baseEmbedding).limit(5).toArray();
    console.log(`✅ Search found ${results.length} results`);

    results.forEach((result, index) => {
      console.log(`  ${index + 1}. ${result.id} - Score: ${result.score || 'N/A'}`);
    });

    console.log('🎉 SUCCESS! Direct embedding addition works!');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

addEmbeddingDirect();
