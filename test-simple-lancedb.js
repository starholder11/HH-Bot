const lancedb = require('@lancedb/lancedb');
const fs = require('fs');

const DIM = 1536;

async function testSimpleLanceDB() {
  try {
    console.log('🚀 Testing simple LanceDB approach...');

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
    const embedding = JSON.parse(embeddingData);

    console.log('Using embedding from embedding.json');
    console.log('Embedding length:', embedding.length);
    console.log('First 5 values:', embedding.slice(0, 5));

    // Create simple data array
    const data = [{
      id: 'test-simple-lancedb',
      content_type: 'text',
      title: 'Test Simple LanceDB',
      embedding: embedding, // Use the array directly
      searchable_text: 'test content from simple lancedb',
      content_hash: 'test-hash-simple',
      last_updated: new Date().toISOString(),
      references: '{"content_url": "test-simple.com"}'
    }];

    // Create table with data
    const table = await db.createTable('semantic_search', data);
    console.log('✅ Created table with data');

    // Check count
    const count = await table.countRows();
    console.log(`✅ Table has ${count} rows`);

    // Create vector index
    console.log('Creating vector index...');
    await table.createIndex('embedding');
    console.log('✅ Created vector index');

    // Try vector search
    console.log('Testing vector search...');
    const searchEmbedding = embedding; // Use the same embedding for search
    const results = await table.vectorSearch(searchEmbedding).limit(5).toArray();
    console.log(`✅ Vector search found ${results.length} results`);

    results.forEach((result, index) => {
      console.log(`  ${index + 1}. ${result.id} - Score: ${result.score || 'N/A'}`);
    });

    console.log('🎉 SUCCESS! LanceDB ingestion and search is working!');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testSimpleLanceDB();
