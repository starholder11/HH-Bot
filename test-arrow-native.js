const lancedb = require('@lancedb/lancedb');
const arrow = require('apache-arrow');
const fs = require('fs');

const DIM = 1536;

async function testArrowNative() {
  try {
    console.log('🚀 Testing Arrow native data structures...');

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

    // Create Arrow data using native Arrow structures
    const arrowData = {
      id: arrow.vectorFromArray(['test-arrow-native']),
      content_type: arrow.vectorFromArray(['text']),
      title: arrow.vectorFromArray(['Test Arrow Native']),
      embedding: arrow.vectorFromArray([embedding], new arrow.FixedSizeList(DIM, new arrow.Field("item", new arrow.Float32(), false))),
      searchable_text: arrow.vectorFromArray(['test content from arrow native']),
      content_hash: arrow.vectorFromArray(['test-hash-arrow-native']),
      last_updated: arrow.vectorFromArray([new Date().toISOString()]),
      references: arrow.vectorFromArray(['{"content_url": "test-arrow-native.com"}'])
    };

    // Create Arrow table
    const arrowTable = arrow.tableFromArrays(arrowData);
    console.log('Arrow table schema:', arrowTable.schema.toString());

    // Create table from Arrow table
    const table = await db.createTable('semantic_search', arrowTable);
    console.log('✅ Created table from Arrow table');

    // Test search
    console.log('Testing search...');
    const searchEmbedding = new Float32Array(embedding);
    const results = await table.search(searchEmbedding).limit(5).toArray();
    console.log(`✅ Search found ${results.length} results`);

    results.forEach((result, index) => {
      console.log(`  ${index + 1}. ${result.id} - Score: ${result.score || 'N/A'}`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testArrowNative();
