#!/usr/bin/env tsx

async function debugLanceDBRecords() {
  console.log('🔍 Debugging LanceDB records...\n');

  const lancedbUrl = 'http://lanced-LoadB-oFgwzoUCRPPr-1582930674.us-east-1.elb.amazonaws.com';

  // Test if we can search with different queries to see any patterns
  const testQueries = [
    'Barry',
    'dinner',
    'video',
    'manual_test_barry_dinner',
    'electronic',
    'text',
    'hello'
  ];

  for (const query of testQueries) {
    console.log(`🔍 Searching for: "${query}"`);
    try {
      const response = await fetch(`${lancedbUrl}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, limit: 5 }),
      });

      const results = await response.json();
      const contentTypes = results.results?.map((r: any) => r.content_type) || [];
      const uniqueTypes = Array.from(new Set(contentTypes));

      console.log(`   Found ${results.results?.length || 0} results`);
      console.log(`   Content types: ${uniqueTypes.join(', ') || 'none'}`);

      if (results.results?.length > 0) {
        const sample = results.results[0];
        console.log(`   Sample: ${sample.title} (${sample.content_type})`);
      }
      console.log('');
    } catch (error) {
      console.error(`   Error: ${error}`);
    }
  }

  // Try to search for very specific IDs we know we added
  console.log('🎯 Searching for specific IDs we added...');
  const specificSearches = [
    'manual_test_barry_dinner',
    'Barry_dinner',
    'lemon_guitar',
    'casino_craps_bad'
  ];

  for (const searchTerm of specificSearches) {
    try {
      const response = await fetch(`${lancedbUrl}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: searchTerm, limit: 20 }),
      });

      const results = await response.json();
      const found = results.results?.find((r: any) =>
        r.id.includes(searchTerm) || r.title.includes(searchTerm)
      );

      if (found) {
        console.log(`✅ Found record for "${searchTerm}": ${found.title} (${found.content_type})`);
      } else {
        console.log(`❌ No record found for "${searchTerm}"`);
      }
    } catch (error) {
      console.error(`   Error searching for ${searchTerm}: ${error}`);
    }
  }

  // Check what search results look like without filtering
  console.log('\n📋 All current search results (unfiltered):');
  try {
    const response = await fetch(`${lancedbUrl}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: 'content media video image audio', limit: 50 }),
    });

    const results = await response.json();
    console.log(`Total results: ${results.results?.length || 0}`);

    if (results.results?.length > 0) {
      const byType = results.results.reduce((acc: any, r: any) => {
        acc[r.content_type] = (acc[r.content_type] || 0) + 1;
        return acc;
      }, {});

      console.log('Results by content type:', byType);

      // Show a few samples from each type
      Object.keys(byType).forEach(type => {
        const samples = results.results.filter((r: any) => r.content_type === type).slice(0, 2);
        console.log(`\n${type.toUpperCase()} samples:`);
        samples.forEach((sample: any) => {
          console.log(`  - ${sample.title} (ID: ${sample.id})`);
        });
      });
    }
  } catch (error) {
    console.error('Error in comprehensive search:', error);
  }
}

debugLanceDBRecords().catch(console.error);
