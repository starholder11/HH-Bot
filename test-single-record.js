const axios = require('axios');

const LANCEDB_URL = 'http://localhost:8000';

async function testSingleRecord() {
  console.log('🧪 Testing single record addition...');

  // Create a proper 1536-dimensional embedding
  const embedding = new Array(1536).fill(0).map((_, idx) => {
    return (idx + 1) * 0.001 + Math.random() * 0.0001;
  });

  console.log(`📏 Embedding length: ${embedding.length}`);
  console.log(`🔢 First 5 values: [${embedding.slice(0, 5).join(', ')}]`);

  const record = {
    id: "test-single-record",
    content_type: "text",
    title: "Test Single Record",
    embedding: embedding,
    searchable_text: "This is a test record for verifying LanceDB ingestion.",
    content_hash: "test-hash-1",
    last_updated: new Date().toISOString(),
    references: JSON.stringify({ source: "test", type: "single" })
  };

  try {
    const response = await axios.post(`${LANCEDB_URL}/add`, record);
    console.log('✅ Record added successfully:', response.data);

    // Check the count
    const countResponse = await axios.get(`${LANCEDB_URL}/count`);
    console.log('📊 Current row count:', countResponse.data);

  } catch (error) {
    console.error('❌ Failed to add record:', error.response?.data || error.message);
  }
}

testSingleRecord().catch(console.error);
