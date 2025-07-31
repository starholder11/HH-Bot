const axios = require('axios');
const fs = require('fs');
const arrow = require('apache-arrow');

const LANCEDB_URL = 'http://localhost:8000';
const DIM = 1536;

async function testArrowEmbedding() {
  try {
    // Read the actual embedding from embedding.json
    const embeddingData = fs.readFileSync('embedding.json', 'utf8');
    const embedding = JSON.parse(embeddingData);

    console.log('Using embedding from embedding.json');
    console.log('Embedding length:', embedding.length);
    console.log('First 5 values:', embedding.slice(0, 5));

    // Create Arrow vector for the embedding
    const embeddingVector = arrow.vectorFromArray([embedding], new arrow.FixedSizeList(DIM, new arrow.Field("item", new arrow.Float32(), false)));

    // Create Arrow table with proper types
    const table = arrow.tableFromArrays({
      id: arrow.vectorFromArray(['test-arrow-embedding']),
      content_type: arrow.vectorFromArray(['text']),
      title: arrow.vectorFromArray(['Test from Arrow']),
      embedding: embeddingVector,
      searchable_text: arrow.vectorFromArray(['test content from arrow']),
      content_hash: arrow.vectorFromArray(['test-hash-arrow']),
      last_updated: arrow.vectorFromArray([new Date().toISOString()]),
      references: arrow.vectorFromArray(['{"content_url": "test-arrow.com"}'])
    });

    console.log('Arrow table schema:', table.schema.toString());
    console.log('Arrow table created successfully');

    // Convert to JSON for HTTP transmission
    const record = {
      id: 'test-arrow-embedding',
      content_type: 'text',
      title: 'Test from Arrow',
      embedding: embedding, // Use the original array
      searchable_text: 'test content from arrow',
      content_hash: 'test-hash-arrow',
      references: { content_url: 'test-arrow.com' }
    };

    const response = await axios.post(`${LANCEDB_URL}/add`, record);
    console.log('✅ Success:', response.data);

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

testArrowEmbedding();
