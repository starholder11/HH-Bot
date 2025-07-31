const axios = require('axios');

const LANCEDB_URL = 'http://localhost:8000';
const BATCH_SIZE = 50;
const TOTAL_RECORDS = 300; // More than the 256 minimum for index building

async function addRecords() {
  console.log(`🚀 Adding ${TOTAL_RECORDS} records to LanceDB...`);

  for (let i = 0; i < TOTAL_RECORDS; i += BATCH_SIZE) {
    const batch = [];
    const batchEnd = Math.min(i + BATCH_SIZE, TOTAL_RECORDS);

    console.log(`📦 Processing batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(TOTAL_RECORDS/BATCH_SIZE)} (records ${i+1}-${batchEnd})`);

    for (let j = i; j < batchEnd; j++) {
      // Create a proper 1536-dimensional embedding array for testing
      const embedding = new Array(1536).fill(0).map((_, idx) => {
        // Create some variation in the embedding values
        return (j + 1) * 0.001 * (idx + 1) + Math.random() * 0.0001;
      });

      const record = {
        id: `test-record-${j + 1}`,
        content_type: "text",
        title: `Test Document ${j + 1}`,
        embedding: embedding,
        searchable_text: `This is test document number ${j + 1} with some sample content for testing the LanceDB vector search functionality.`,
        content_hash: `hash-${j + 1}`,
        last_updated: new Date().toISOString(),
        references: JSON.stringify({ source: "test", batch: Math.floor(j/BATCH_SIZE) + 1 })
      };

      batch.push(record);
    }

    // Add batch to LanceDB
    try {
      for (const record of batch) {
        const response = await axios.post(`${LANCEDB_URL}/add`, record);
        if (response.data.success) {
          process.stdout.write('.');
        } else {
          console.error(`❌ Failed to add record ${record.id}:`, response.data);
        }
      }
    } catch (error) {
      console.error(`❌ Batch ${Math.floor(i/BATCH_SIZE) + 1} failed:`, error.response?.data || error.message);
    }
  }

  console.log(`\n✅ Added ${TOTAL_RECORDS} records to LanceDB`);

  // Check the total count
  try {
    const response = await axios.get(`${LANCEDB_URL}/debug/schema`);
    console.log(`📊 Current schema:`, response.data);
  } catch (error) {
    console.error('❌ Failed to get schema:', error.message);
  }
}

addRecords().catch(console.error);
