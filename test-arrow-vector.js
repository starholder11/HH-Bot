const lancedb = require('@lancedb/lancedb');
const arrow = require('apache-arrow');
const fs = require('fs');

const DIM = 1536;

async function testArrowVector() {
  try {
    console.log('🚀 Testing LanceDB with Arrow vector column...');

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
    const baseEmbedding = JSON.parse(embeddingData);

    console.log('Using embedding from embedding.json');
    console.log('Embedding length:', baseEmbedding.length);
    console.log('First 5 values:', baseEmbedding.slice(0, 5));

    // Create 300 rows of data with Arrow vectors
    const embeddings = [];
    const ids = [];
    const contentTypes = [];
    const titles = [];
    const searchableTexts = [];
    const contentHashes = [];
    const lastUpdated = [];
    const references = [];

    for (let i = 0; i < 300; i++) {
      // Create slight variations of the base embedding
      const embedding = baseEmbedding.map(val => val + (Math.random() - 0.5) * 0.01);
      embeddings.push(embedding);
      ids.push(`test-row-${i}`);
      contentTypes.push('text');
      titles.push(`Test Row ${i}`);
      searchableTexts.push(`test content for row ${i}`);
      contentHashes.push(`test-hash-${i}`);
      lastUpdated.push(new Date().toISOString());
      references.push(`{"content_url": "test-${i}.com"}`);
    }

    // Create Arrow vectors with proper types
    const arrowData = {
      id: arrow.vectorFromArray(ids),
      content_type: arrow.vectorFromArray(contentTypes),
      title: arrow.vectorFromArray(titles),
      embedding: arrow.vectorFromArray(embeddings, new arrow.FixedSizeList(DIM, new arrow.Field("item", new arrow.Float32(), false))),
      searchable_text: arrow.vectorFromArray(searchableTexts),
      content_hash: arrow.vectorFromArray(contentHashes),
      last_updated: arrow.vectorFromArray(lastUpdated),
      references: arrow.vectorFromArray(references)
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

    // Create vector index
    console.log('Creating vector index...');
    await table.createIndex('embedding');
    console.log('✅ Created vector index');

    // Try vector search
    console.log('Testing vector search...');
    const searchEmbedding = baseEmbedding;
    const results = await table.vectorSearch(searchEmbedding).limit(5).toArray();
    console.log(`✅ Vector search found ${results.length} results`);

    results.forEach((result, index) => {
      console.log(`  ${index + 1}. ${result.id} - Score: ${result.score || 'N/A'}`);
    });

    console.log('🎉 SUCCESS! LanceDB vector search is working!');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testArrowVector();
