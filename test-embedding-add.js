const axios = require('axios');
const fs = require('fs');

const LANCEDB_URL = 'http://localhost:8000';
const DIM = 1536;

async function testAddEmbedding() {
  try {
    // Read the actual embedding from embedding.json
    const embeddingData = fs.readFileSync('embedding.json', 'utf8');
    const embedding = JSON.parse(embeddingData);

    console.log('Using embedding from embedding.json');
    console.log('Embedding length:', embedding.length);
    console.log('First 5 values:', embedding.slice(0, 5));

    // Convert to Float32Array, then to base64 for LanceDB
    const f32 = new Float32Array(embedding);
    const buf = Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength);
    const embedding_b64 = buf.toString('base64');

    console.log('Converted to base64, length:', embedding_b64.length);
    console.log('First 20 chars:', embedding_b64.substring(0, 20));

    const record = {
      id: "test-embedding-json",
      content_type: "text",
      title: "Test from embedding.json",
      embedding_b64: embedding_b64, // Send base64 string
      searchable_text: "test content from embedding.json",
      content_hash: "test-hash-json",
      references: { content_url: "test-json.com" }
    };

    const response = await axios.post(`${LANCEDB_URL}/add`, record);
    console.log('✅ Success:', response.data);

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

testAddEmbedding();
