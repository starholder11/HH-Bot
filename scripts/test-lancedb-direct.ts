#!/usr/bin/env tsx

async function testLanceDBDirect() {
  console.log('🔍 Testing LanceDB directly...\n');

  const lancedbUrl = 'http://lanced-LoadB-oFgwzoUCRPPr-1582930674.us-east-1.elb.amazonaws.com';

  // First, let's add a record and immediately try to get it by ID
  console.log('📤 Adding test record...');
  const addResponse = await fetch(`${lancedbUrl}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id: 'direct_test_001',
      content_type: 'video',
      title: 'Direct Test Video',
      content_text: 'direct test video content for debugging',
      references: { s3_url: 'test' },
      metadata: { test: true, media_type: 'video' }
    }),
  });

  const addResult = await addResponse.json();
  console.log('Add result:', addResult);

  if (addResult.success) {
    console.log('✅ Record added successfully');

    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Try to get the record directly by ID
    console.log('🔍 Trying to get record by ID...');
    try {
      const getResponse = await fetch(`${lancedbUrl}/embeddings/direct_test_001`);
      const getResult = await getResponse.json();
      console.log('Get by ID result:', getResult);
    } catch (error) {
      console.log('No direct get endpoint, trying search...');
    }

    // Try a very specific search that should match our record
    console.log('🔍 Searching for exact ID...');
    const searchResponse = await fetch(`${lancedbUrl}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: 'direct test video content for debugging',
        limit: 20
      }),
    });

    const searchResult = await searchResponse.json();
    console.log('Search result count:', searchResult.results?.length || 0);

    // Look for our specific record
    const ourRecord = searchResult.results?.find((r: any) => r.id === 'direct_test_001');
    if (ourRecord) {
      console.log('🎉 FOUND OUR RECORD!');
      console.log('Record:', ourRecord);
    } else {
      console.log('❌ Our record not found in search results');
      console.log('Available records:');
      searchResult.results?.slice(0, 5).forEach((r: any, i: number) => {
        console.log(`  ${i + 1}. ${r.id} (${r.content_type}) - ${r.title}`);
      });
    }

    // Try searching with content type filter
    console.log('\n🔍 Searching with content type filter...');
    const filteredResponse = await fetch(`${lancedbUrl}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: 'test',
        limit: 50,
        content_types: ['video']
      }),
    });

    const filteredResult = await filteredResponse.json();
    console.log('Filtered search results:', filteredResult.results?.length || 0);
    console.log('Content types found:', [...new Set(filteredResult.results?.map((r: any) => r.content_type) || [])]);
  } else {
    console.log('❌ Failed to add record:', addResult);
  }
}

testLanceDBDirect().catch(console.error);
