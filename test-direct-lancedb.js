const lancedb = require('@lancedb/lancedb');
const arrow = require('apache-arrow');
const fs = require('fs');

const DIM = 1536;

async function testDirectLanceDB() {
  try {
    console.log('🚀 Testing direct LanceDB connection...');

    // Connect to LanceDB directly
    const db = await lancedb.connect('/tmp/lancedb');
    console.log('✅ Connected to LanceDB');

    // Check if table exists, if not create it
    let table;
    try {
      table = await db.openTable('semantic_search');
      console.log('✅ Opened existing table');
    } catch (error) {
      console.log('Table not found, creating new table...');

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
      table = await db.createEmptyTable('semantic_search', schema);
      console.log('✅ Created table with explicit vector schema');
    }

    // Read the actual embedding from embedding.json
    const embeddingData = fs.readFileSync('embedding.json', 'utf8');
    const embedding = JSON.parse(embeddingData);

    console.log('Using embedding from embedding.json');
    console.log('Embedding length:', embedding.length);
    console.log('First 5 values:', embedding.slice(0, 5));

    // Convert to Float32Array
    const vec = new Float32Array(embedding);

    // Create record
    const record = {
      id: 'test-direct-lancedb',
      content_type: 'text',
      title: 'Test Direct LanceDB',
      embedding: vec,
      searchable_text: 'test content from direct lancedb',
      content_hash: 'test-hash-direct',
      last_updated: new Date().toISOString(),
      references: '{"content_url": "test-direct.com"}'
    };

    console.log('Adding record directly to LanceDB...');
    await table.add([record]);
    console.log('✅ Successfully added record directly to LanceDB');

    // Test search
    console.log('Testing search...');
    const results = await table.search(vec).limit(5).toArray();
    console.log(`✅ Search found ${results.length} results`);

    results.forEach((result, index) => {
      console.log(`  ${index + 1}. ${result.id} - Score: ${result.score || 'N/A'}`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testDirectLanceDB();
