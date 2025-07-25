#!/usr/bin/env tsx

async function testLanceDBSearch() {
  console.log('🔍 Testing LanceDB search directly...');

  const lancedbUrl = process.env.LANCEDB_API_URL || 'http://lanced-LoadB-oFgwzoUCRPPr-1582930674.us-east-1.elb.amazonaws.com';

  try {
    // Test 1: Search for "chess"
    console.log('\n🎯 Test 1: Searching for "chess"...');
    const chessResponse = await fetch(`${lancedbUrl}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'chess', limit: 5 })
    });

    console.log(`Response status: ${chessResponse.status}`);
    console.log(`Response headers:`, Object.fromEntries(chessResponse.headers.entries()));

    if (chessResponse.ok) {
      const chessResults = await chessResponse.json();
      console.log(`Chess results: ${JSON.stringify(chessResults, null, 2)}`);
    } else {
      const errorText = await chessResponse.text();
      console.error(`Chess search failed: ${errorText}`);
    }

    // Test 2: Search for "casino"
    console.log('\n🎯 Test 2: Searching for "casino"...');
    const casinoResponse = await fetch(`${lancedbUrl}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'casino', limit: 5 })
    });

    console.log(`Response status: ${casinoResponse.status}`);

    if (casinoResponse.ok) {
      const casinoResults = await casinoResponse.json();
      console.log(`Casino results: ${JSON.stringify(casinoResults, null, 2)}`);
    } else {
      const errorText = await casinoResponse.text();
      console.error(`Casino search failed: ${errorText}`);
    }

    // Test 3: Get all records
    console.log('\n🎯 Test 3: Getting all records...');
    const allResponse = await fetch(`${lancedbUrl}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '', limit: 10 })
    });

    console.log(`Response status: ${allResponse.status}`);

    if (allResponse.ok) {
      const allResults = await allResponse.json();
      console.log(`All results count: ${allResults.length || 0}`);
      if (allResults && allResults.length > 0) {
        console.log('Sample results:');
        allResults.slice(0, 3).forEach((result: any, index: number) => {
          console.log(`  ${index + 1}. ${result.title} (${result.content_type})`);
        });
      }
    } else {
      const errorText = await allResponse.text();
      console.error(`All records search failed: ${errorText}`);
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testLanceDBSearch().catch(console.error);
