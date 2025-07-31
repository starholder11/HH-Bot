const lancedb = require('@lancedb/lancedb');
const arrow = require('apache-arrow');
const fs = require('fs');

const DIM = 1536;

async function fixTableArrow() {
  try {
    console.log('🚀 Fixing table schema with Arrow...');

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

    // Create Arrow vectors with proper types
    const arrowData = {
      id: arrow.vectorFromArray(['test-embedding-arrow']),
      content_type: arrow.vectorFromArray(['text']),
      title: arrow.vectorFromArray(['Test Arrow Schema']),
      embedding: arrow.vectorFromArray([baseEmbedding], new arrow.FixedSizeList(DIM, new arrow.Field("item", new arrow.Float32(), false))),
      searchable_text: arrow.vectorFromArray(['test content from arrow schema']),
      content_hash: arrow.vectorFromArray(['test-hash-arrow']),
      last_updated: arrow.vectorFromArray([new Date().toISOString()]),
      references: arrow.vectorFromArray(['{"content_url": "test-arrow.com"}'])
    };

    // Create Arrow table
    const arrowTable = arrow.tableFromArrays(arrowData);
    console.log('Arrow table schema:', arrowTable.schema.toString());

    // Create table from Arrow table
    const table = await db.createTable('semantic_search', arrowTable);
    console.log('✅ Created table from Arrow table');

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

    console.log('🎉 SUCCESS! Arrow table schema is correct!');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

fixTableArrow();
