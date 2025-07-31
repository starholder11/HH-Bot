const axios = require('axios');
const fs = require('fs');

const LANCEDB_URL = 'http://localhost:8000';

async function testAddEndpoint() {
  try {
    console.log('🚀 Testing /add endpoint with embedding.json data...');

    // Read the actual embedding from embedding.json
    const embeddingData = fs.readFileSync('embedding.json', 'utf8');
    const embedding = JSON.parse(embeddingData);

    console.log('Using embedding from embedding.json');
    console.log('Embedding length:', embedding.length);
    console.log('First 5 values:', embedding.slice(0, 5));
    console.log('Is Array:', Array.isArray(embedding));
    console.log('Type:', typeof embedding);

    // CRITICAL: Convert to Float32Array to ensure proper serialization
    const float32Embedding = new Float32Array(embedding);
    console.log('Float32Array length:', float32Embedding.length);
    console.log('Float32Array first 5:', Array.from(float32Embedding).slice(0, 5));

    // Create test record with the correct format
    const record = {
      id: "test-embedding-json",
      content_type: "text",
      title: "Test from embedding.json",
      embedding: Array.from(float32Embedding), // Convert back to array for JSON serialization
      searchable_text: "test content from embedding.json",
      content_hash: "test-hash-json",
      references: { content_url: "test-json.com" }
    };

    console.log('Record embedding length:', record.embedding.length);
    console.log('Record embedding is array:', Array.isArray(record.embedding));
    console.log('Record embedding first 5:', record.embedding.slice(0, 5));

    // Debug: Check what JSON.stringify does to the embedding
    const jsonString = JSON.stringify(record.embedding);
    console.log('JSON string length:', jsonString.length);
    console.log('JSON string first 100 chars:', jsonString.substring(0, 100));

    console.log('Sending record to /add endpoint...');
    const response = await axios.post(`${LANCEDB_URL}/add`, record);
    console.log('✅ Success:', response.data);

    // Test search to verify it works
    console.log('Testing search...');
    const searchResponse = await axios.post(`${LANCEDB_URL}/search`, {
      query_embedding: Array.from(float32Embedding),
      limit: 5
    });
    console.log('✅ Search results:', searchResponse.data);

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

testAddEndpoint();
