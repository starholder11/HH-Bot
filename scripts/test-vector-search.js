const axios = require('axios');

const LANCEDB_URL = 'http://localhost:8000';

async function addTestRecords() {
  console.log('🚀 Adding 256 test records...');

  for (let i = 0; i < 256; i++) {
    const embedding = Array(1536).fill(0.001).map((val, index) => val + (index * 0.0001) + (i * 0.001));

    const record = {
      id: `test-record-${i}`,
      content_type: 'text',
      title: `Test Record ${i}`,
      embedding: embedding,
      searchable_text: `This is test record ${i} with some content`,
      content_hash: `test${i}`,
      references: { content_url: `test-${i}` }
    };

    try {
      const response = await axios.post(`${LANCEDB_URL}/add`, record);
      if (response.data.success) {
        console.log(`✅ Added record ${i + 1}/256`);
      } else {
        console.log(`❌ Failed to add record ${i + 1}:`, response.data.error);
      }
    } catch (error) {
      console.log(`❌ Error adding record ${i + 1}:`, error.message);
    }

    // Small delay to avoid overwhelming the service
    if (i % 50 === 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  console.log('✅ Finished adding test records');
}

async function testVectorSearch() {
  console.log('🔍 Testing vector search...');

  try {
    // Test search with a query
    const searchResponse = await axios.post(`${LANCEDB_URL}/search`, {
      query: 'test record',
      limit: 10,
      threshold: 0.1
    });

    console.log('✅ Vector search successful!');
    console.log('Results:', JSON.stringify(searchResponse.data, null, 2));

    return searchResponse.data.results.length > 0;
  } catch (error) {
    console.log('❌ Vector search failed:', error.response?.data || error.message);
    return false;
  }
}

async function checkRecordCount() {
  try {
    const response = await axios.get(`${LANCEDB_URL}/count`);
    console.log(`📊 Current record count: ${response.data.count}`);
    return response.data.count;
  } catch (error) {
    console.log('❌ Failed to get record count:', error.message);
    return 0;
  }
}

async function main() {
  console.log('🧪 Starting vector search test...');

  // Check initial count
  const initialCount = await checkRecordCount();
  console.log(`📊 Initial record count: ${initialCount}`);

  // Add test records
  await addTestRecords();

  // Check final count
  const finalCount = await checkRecordCount();
  console.log(`📊 Final record count: ${finalCount}`);

  // Test vector search
  const searchSuccess = await testVectorSearch();

  if (searchSuccess) {
    console.log('🎉 Vector search is working correctly!');
  } else {
    console.log('❌ Vector search is not working properly');
  }
}

main().catch(console.error);
