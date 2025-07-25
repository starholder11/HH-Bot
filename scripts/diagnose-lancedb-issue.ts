#!/usr/bin/env tsx

async function diagnoseLanceDBIssue() {
  console.log('🔍 Diagnosing LanceDB vector indexing issue...');

  const lancedbUrl = process.env.LANCEDB_API_URL || 'http://lanced-LoadB-oFgwzoUCRPPr-1582930674.us-east-1.elb.amazonaws.com';

  try {
    // Step 1: Check if media records exist in LanceDB
    console.log('\n🎯 Step 1: Checking if media records exist...');

    // Test a known media ID that we just ingested
    const testMediaId = 'a58bc96b-3444-4dd2-9328-bf0ee8963b45'; // Keyframe we ingested

    try {
      const response = await fetch(`${lancedbUrl}/get/${testMediaId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      console.log(`Response status: ${response.status}`);

      if (response.ok) {
        const result = await response.json();
        console.log(`✅ Found media record: ${result.title} (${result.content_type})`);
        console.log(`   - Has embedding: ${result.embedding ? 'Yes' : 'No'}`);
        if (result.embedding) {
          console.log(`   - Embedding length: ${result.embedding.length}`);
        }
      } else {
        const errorText = await response.text();
        console.error(`❌ Media record not found: ${errorText}`);
      }
    } catch (error) {
      console.error('Media get error:', error);
    }

    // Step 2: Test vector search with a simple query
    console.log('\n🎯 Step 2: Testing vector search...');

    const searchResponse = await fetch(`${lancedbUrl}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'chess',
        limit: 10,
        include_embeddings: true // Request embeddings to see what's happening
      })
    });

    if (searchResponse.ok) {
      const results = await searchResponse.json();
      console.log(`✅ Search returned ${results.results?.length || 0} results`);

      if (results.results && results.results.length > 0) {
        console.log('Sample results:');
        results.results.slice(0, 5).forEach((result: any, index: number) => {
          console.log(`   ${index + 1}. ${result.title} (${result.content_type}) - Score: ${(result.score * 100).toFixed(1)}%`);
          console.log(`      - Has embedding: ${result.embedding ? 'Yes' : 'No'}`);
          if (result.embedding) {
            console.log(`      - Embedding length: ${result.embedding.length}`);
          }
        });
      }
    } else {
      const errorText = await searchResponse.text();
      console.error(`❌ Search failed: ${errorText}`);
    }

    // Step 3: Test LanceDB service health
    console.log('\n🎯 Step 3: Testing LanceDB service health...');

    try {
      const healthResponse = await fetch(`${lancedbUrl}/health`);
      if (healthResponse.ok) {
        const health = await healthResponse.json();
        console.log(`✅ LanceDB health: ${JSON.stringify(health, null, 2)}`);
      } else {
        console.log(`❌ Health check failed: ${healthResponse.status}`);
      }
    } catch (error) {
      console.error('Health check error:', error);
    }

    // Step 4: Test ready endpoint
    console.log('\n🎯 Step 4: Testing LanceDB ready status...');

    try {
      const readyResponse = await fetch(`${lancedbUrl}/ready`);
      if (readyResponse.ok) {
        const ready = await readyResponse.json();
        console.log(`✅ LanceDB ready: ${JSON.stringify(ready, null, 2)}`);
      } else {
        console.log(`❌ Ready check failed: ${readyResponse.status}`);
      }
    } catch (error) {
      console.error('Ready check error:', error);
    }

  } catch (error) {
    console.error('❌ Diagnosis failed:', error);
  }
}

diagnoseLanceDBIssue().catch(console.error);
