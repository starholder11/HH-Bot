const lancedb = require('@lancedb/lancedb');
const arrow = require('apache-arrow');
const fs = require('fs');

const DIM = 1536;

async function testSchemaLanceDB() {
  try {
    console.log('🚀 Testing LanceDB with explicit schema...');

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

    // Define schema explicitly with FixedSizeList(1536, Float32)
    const schema = new arrow.Schema([
      new arrow.Field("id", new arrow.Utf8(), false),
      new arrow.Field("content_type", new arrow.Utf8(), false),
      new arrow.Field("title", new arrow.Utf8(), true),
      new arrow.Field("embedding", new arrow.FixedSizeList(DIM, new arrow.Field("item", new arrow.Float32(), false)), false),
      new arrow.Field("searchable_text", new arrow.Utf8(), true),
      new arrow.Field("content_hash", new arrow.Utf8(), true),
      new arrow.Field("last_updated", new arrow.Utf8(), true),
      new arrow.Field("references", new arrow.Utf8(), true)
    ]);

    // Create empty table with explicit schema
    const table = await db.createEmptyTable('semantic_search', schema);
    console.log('✅ Created table with explicit vector schema');

    // Add data
    const record = {
      id: 'test-schema-lancedb',
      content_type: 'text',
      title: 'Test Schema LanceDB',
      embedding: new Float32Array(embedding),
      searchable_text: 'test content from schema lancedb',
      content_hash: 'test-hash-schema',
      last_updated: new Date().toISOString(),
      references: '{"content_url": "test-schema.com"}'
    };

    await table.add([record]);
    console.log('✅ Added record to table');

    // Check count
    const count = await table.countRows();
    console.log(`✅ Table has ${count} rows`);

    // Create vector index
    console.log('Creating vector index...');
    await table.createIndex('embedding');
    console.log('✅ Created vector index');

    // Try vector search
    console.log('Testing vector search...');
    const searchEmbedding = new Float32Array(embedding);
    const results = await table.vectorSearch(searchEmbedding).limit(5).toArray();
    console.log(`✅ Vector search found ${results.length} results`);

    results.forEach((result, index) => {
      console.log(`  ${index + 1}. ${result.id} - Score: ${result.score || 'N/A'}`);
    });

    console.log('🎉 SUCCESS! LanceDB with explicit schema is working!');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testSchemaLanceDB();
