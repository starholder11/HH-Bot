const axios = require('axios');

const LANCEDB_URL = 'http://localhost:8000';

async function buildIndex() {
  console.log('🔧 Building vector index on LanceDB...');

  try {
    // First, let's check the current schema and row count
    const schemaResponse = await axios.get(`${LANCEDB_URL}/debug/schema`);
    console.log('📊 Current schema:', schemaResponse.data);

    // Build the index
    const response = await axios.post(`${LANCEDB_URL}/build-index`, {
      column: 'embedding',
      metric: 'cosine',
      num_partitions: 256,
      replace: true
    });

    console.log('✅ Index build response:', response.data);

    // Check if the index was created successfully
    const indexResponse = await axios.get(`${LANCEDB_URL}/debug/index`);
    console.log('📈 Index status:', indexResponse.data);

  } catch (error) {
    console.error('❌ Failed to build index:', error.response?.data || error.message);
  }
}

buildIndex().catch(console.error);
