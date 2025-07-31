const lancedb = require('@lancedb/lancedb');
const arrow = require('apache-arrow');
const fs = require('fs');

const DIM = 1536;

async function fixTableFloat32() {
  try {
    console.log('🚀 Fixing table schema with Float32Array...');

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

    console.log('Creating empty table with explicit schema...');
    const table = await db.createEmptyTable('semantic_search', schema);
    console.log('✅ Created empty table with explicit schema');

    // Read the actual embedding from embedding.json
    const embeddingData = fs.readFileSync('embedding.json', 'utf8');
    const baseEmbedding = JSON.parse(embeddingData);

    console.log('Using embedding from embedding.json');
    console.log('Embedding length:', baseEmbedding.length);
    console.log('First 5 values:', baseEmbedding.slice(0, 5));

    // Convert to Float32Array
    const float32Embedding = new Float32Array(baseEmbedding);
    console.log('Float32Array length:', float32Embedding.length);
    console.log('Float32Array first 5:', Array.from(float32Embedding).slice(0, 5));

    // Create a record with the Float32Array embedding
    const record = {
      id: "test-embedding-float32",
      content_type: "text",
      title: "Test Float32Array",
      embedding: float32Embedding, // Use Float32Array directly
      searchable_text: "test content from float32 array",
      content_hash: "test-hash-float32",
      last_updated: new Date().toISOString(),
      references: '{"content_url": "test-float32.com"}'
    };

    console.log('Adding record with Float32Array to empty table...');
    await table.add([record]);
    console.log('✅ Added record to table');

    // Check count
    const count = await table.countRows();
    console.log(`✅ Table has ${count} rows`);

    // Get schema to verify
    const tableSchema = await table.schema();
    console.log('Table schema:', tableSchema.toString());

    // Test search
    console.log('Testing search...');
    const results = await table.vectorSearch(float32Embedding).limit(5).toArray();
    console.log(`✅ Search found ${results.length} results`);

    results.forEach((result, index) => {
      console.log(`  ${index + 1}. ${result.id} - Score: ${result.score || 'N/A'}`);
    });

    console.log('🎉 SUCCESS! Float32Array table works!');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

fixTableFloat32();
