const LANCEDB_URL = 'http://localhost:8000';

async function testScan() {
  try {
    console.log('🔍 Testing table scan...');

    // Try to get all records without search
    const response = await fetch(`${LANCEDB_URL}/scan`, {
      method: 'GET',
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Scan failed:', errorText);
      return;
    }

    const results = await response.json();
    console.log('Scan results:', JSON.stringify(results, null, 2));

  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testScan();
