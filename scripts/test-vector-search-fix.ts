#!/usr/bin/env tsx

import { OpenAI } from 'openai';

// LanceDB service endpoint
const LANCEDB_API_URL = process.env.LANCEDB_API_URL ||
  'http://lanced-LoadB-oFgwzoUCRPPr-1582930674.us-east-1.elb.amazonaws.com';

async function testVectorSearchFix() {
  console.log('🔍 Testing Vector Search Fix...');

  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY environment variable is required');
    process.exit(1);
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    // Step 1: Generate a test embedding for "almond al"
    console.log('\n🔍 Step 1: Generating test embedding for "almond al"...');
    const testEmbedding = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: 'almond al',
    });

    const embedding = testEmbedding.data[0].embedding;
    console.log(`✅ Generated embedding: ${embedding.length} dimensions`);

    // Step 2: Test search with the embedding
    console.log('\n🔍 Step 2: Testing search with embedding...');
    const searchResponse = await fetch(`${LANCEDB_API_URL}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'almond al',
        limit: 10
      })
    });

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      console.log('❌ Search failed:', errorText);
      return;
    }

    const searchResults = await searchResponse.json();
    console.log(`📋 Search returned ${searchResults.results.length} results`);

    // Step 3: Check if "All Purpose Bees" content appears
    console.log('\n🔍 Step 3: Checking for "All Purpose Bees" content...');
    const allPurposeBeesResults = searchResults.results.filter((r: any) =>
      r.id?.includes('all-purpose-bees') ||
      r.title?.toLowerCase().includes('all purpose bees')
    );

    if (allPurposeBeesResults.length > 0) {
      console.log('✅ "All Purpose Bees" content found in search results!');
      console.log('📋 All Purpose Bees results:');
      allPurposeBeesResults.forEach((r: any, i: number) => {
        console.log(`  ${i + 1}. ${r.title} (score: ${r.score})`);
      });
    } else {
      console.log('❌ "All Purpose Bees" content NOT found in search results');

      // Step 4: Check if the content exists in the database
      console.log('\n🔍 Step 4: Checking if "All Purpose Bees" content exists in database...');

      // Try to get all records to see what's actually in the database
      const allRecordsResponse = await fetch(`${LANCEDB_API_URL}/embeddings`);

      if (allRecordsResponse.ok) {
        const allRecords = await allRecordsResponse.json();
        const allPurposeBeesRecords = allRecords.filter((r: any) =>
          r.id?.includes('all-purpose-bees') ||
          r.title?.toLowerCase().includes('all purpose bees')
        );

        console.log(`📋 Total records in database: ${allRecords.length}`);
        console.log(`📋 All Purpose Bees records found: ${allPurposeBeesRecords.length}`);

        if (allPurposeBeesRecords.length > 0) {
          console.log('✅ "All Purpose Bees" content exists in database');
          console.log('📋 All Purpose Bees records:');
          allPurposeBeesRecords.forEach((r: any, i: number) => {
            console.log(`  ${i + 1}. ${r.title} (ID: ${r.id})`);
          });

          console.log('\n💡 The content exists but vector search is not working properly');
          console.log('💡 This confirms the vector search schema issue');
        } else {
          console.log('❌ "All Purpose Bees" content NOT found in database');
          console.log('💡 This suggests an ingestion issue');
        }
      } else {
        console.log('⚠️ Could not fetch all records to check content existence');
      }
    }

    // Step 5: Test with a different query to see if search works at all
    console.log('\n🔍 Step 5: Testing search with "hello world" query...');
    const helloWorldResponse = await fetch(`${LANCEDB_API_URL}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'hello world',
        limit: 5
      })
    });

    if (helloWorldResponse.ok) {
      const helloWorldResults = await helloWorldResponse.json();
      const helloWorldRecords = helloWorldResults.results.filter((r: any) =>
        r.id?.includes('hello-world') ||
        r.title?.toLowerCase().includes('hello world')
      );

      if (helloWorldRecords.length > 0) {
        console.log('✅ "Hello World" content found in search results');
        console.log('💡 This confirms that vector search works for some content');
        console.log('💡 The issue is specific to "All Purpose Bees" content');
      } else {
        console.log('❌ "Hello World" content NOT found in search results');
        console.log('💡 This suggests a broader vector search issue');
      }
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testVectorSearchFix().catch(console.error);
