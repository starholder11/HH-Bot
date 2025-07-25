#!/usr/bin/env tsx

async function testEmbeddingStorage() {
  console.log('🔍 Testing embedding storage...\n');

  const lancedbUrl = 'http://lanced-LoadB-oFgwzoUCRPPr-1582930674.us-east-1.elb.amazonaws.com';

  // Add a video record with explicit embedding
  console.log('📤 Adding video record with explicit embedding...');

  const addResponse = await fetch(`${lancedbUrl}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id: 'embedding_storage_test',
      content_type: 'video',
      title: 'Embedding Storage Test',
      content_text: 'This is a test video with explicit embedding for debugging vector search issues',
      references: { s3_url: 'test' },
      metadata: { test: true, media_type: 'video' }
    }),
  });

  const addResult = await addResponse.json();
  console.log('Add result:', addResult);

  if (addResult.success) {
    console.log('✅ Record added successfully');

    // Wait for indexing
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Get the record directly to check its structure
    console.log('🔍 Getting record directly...');
    const getResponse = await fetch(`${lancedbUrl}/embeddings/embedding_storage_test`);
    const getResult = await getResponse.json();
    console.log('Record structure:', JSON.stringify(getResult, null, 2));

    // Try a very specific search that should match our record
    console.log('🔍 Searching with exact content...');
    const searchResponse = await fetch(`${lancedbUrl}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: 'This is a test video with explicit embedding for debugging vector search issues',
        limit: 10
      }),
    });

    const searchResult = await searchResponse.json();
    console.log('Search results count:', searchResult.results?.length || 0);

    const ourRecord = searchResult.results?.find((r: any) => r.id === 'embedding_storage_test');
    if (ourRecord) {
      console.log('🎉 SUCCESS: Found our video record in search!');
      console.log('Record:', ourRecord);
    } else {
      console.log('❌ Video record not found in search results');
      console.log('This confirms a LanceDB vector search bug');

      // Try searching with a broader query
      console.log('🔍 Trying broader search...');
      const broadSearchResponse = await fetch(`${lancedbUrl}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: 'test video',
          limit: 20
        }),
      });

      const broadSearchResult = await broadSearchResponse.json();
      console.log('Broad search results count:', broadSearchResult.results?.length || 0);
      console.log('Content types in broad search:', [...new Set(broadSearchResult.results?.map((r: any) => r.content_type) || [])]);
    }
  } else {
    console.log('❌ Failed to add record:', addResult);
  }
}

testEmbeddingStorage().catch(console.error);
