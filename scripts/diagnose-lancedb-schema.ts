#!/usr/bin/env tsx

import { OpenAI } from 'openai';

// LanceDB service endpoint
const LANCEDB_API_URL = process.env.LANCEDB_API_URL ||
  'http://lanced-LoadB-oFgwzoUCRPPr-1582930674.us-east-1.elb.amazonaws.com';

async function diagnoseLanceDBSchema() {
  console.log('🔍 Diagnosing LanceDB Schema Configuration...');
  console.log(`📍 LanceDB Service: ${LANCEDB_API_URL}`);

  try {
    // Step 1: Check table schema
    console.log('\n📋 Step 1: Checking table schema...');
    const schemaResponse = await fetch(`${LANCEDB_API_URL}/debug/table-info`);

    if (!schemaResponse.ok) {
      throw new Error(`Failed to fetch schema: ${schemaResponse.status} ${schemaResponse.statusText}`);
    }

    const schemaData = await schemaResponse.json();
    console.log('📋 Schema Response:', JSON.stringify(schemaData, null, 2));

    if (schemaData.error) {
      console.log('❌ Schema check failed:', schemaData.error);
      return;
    }

    // Step 2: Check if embedding column is properly configured as vector
    console.log('\n🔍 Step 2: Analyzing embedding column configuration...');

    if (schemaData.schema) {
      const embeddingField = schemaData.schema.fields?.find((f: any) => f.name === 'embedding');

      if (embeddingField) {
        console.log('📋 Embedding field configuration:', JSON.stringify(embeddingField, null, 2));

        // Check if it's a proper vector column
        if (embeddingField.type?.name === 'fixed_size_list') {
          console.log('❌ ISSUE FOUND: Embedding column is using FixedSizeList instead of vector type');
          console.log('💡 This is why vector search is not working properly');
        } else if (embeddingField.type?.name === 'vector') {
          console.log('✅ Embedding column is properly configured as vector type');
        } else {
          console.log('⚠️ Unknown embedding column type:', embeddingField.type?.name);
        }
      } else {
        console.log('❌ Embedding field not found in schema');
      }
    }

    // Step 3: Check vector indices
    console.log('\n🔍 Step 3: Checking vector indices...');

    if (schemaData.indices) {
      console.log('📋 Current indices:', JSON.stringify(schemaData.indices, null, 2));

      if (schemaData.indices.length === 0) {
        console.log('❌ No vector indices found - this explains search failures');
      } else {
        console.log('✅ Vector indices exist');
      }
    }

    // Step 4: Test vector search functionality
    console.log('\n🔍 Step 4: Testing vector search functionality...');

    if (!process.env.OPENAI_API_KEY) {
      console.log('⚠️ OPENAI_API_KEY not set, skipping vector search test');
      return;
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Generate a test embedding
    const testEmbedding = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: 'almond al',
    });

    console.log(`🔍 Test embedding generated: ${testEmbedding.data[0].embedding.length} dimensions`);

    // Test vector search
    const searchResponse = await fetch(`${LANCEDB_API_URL}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query_embedding: testEmbedding.data[0].embedding,
        limit: 5
      })
    });

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      console.log('❌ Vector search test failed:', errorText);
    } else {
      const searchResults = await searchResponse.json();
      console.log('✅ Vector search test successful');
      console.log(`📋 Found ${searchResults.length} results`);

      // Check if "All Purpose Bees" content appears
      const allPurposeBeesResults = searchResults.filter((r: any) =>
        r.id?.includes('all-purpose-bees') ||
        r.title?.toLowerCase().includes('all purpose bees')
      );

      if (allPurposeBeesResults.length > 0) {
        console.log('✅ "All Purpose Bees" content found in search results');
        console.log('📋 All Purpose Bees results:', allPurposeBeesResults.map((r: any) => ({
          id: r.id,
          title: r.title,
          score: r.score
        })));
      } else {
        console.log('❌ "All Purpose Bees" content NOT found in search results');
        console.log('💡 This confirms the vector search issue');
      }
    }

    // Step 5: Check if "All Purpose Bees" content exists in database
    console.log('\n🔍 Step 5: Checking if "All Purpose Bees" content exists...');

    const allRecordsResponse = await fetch(`${LANCEDB_API_URL}/records`);

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
        console.log('📋 All Purpose Bees records:', allPurposeBeesRecords.map((r: any) => ({
          id: r.id,
          title: r.title
        })));
      } else {
        console.log('❌ "All Purpose Bees" content NOT found in database');
        console.log('💡 This suggests an ingestion issue, not just a search issue');
      }
    } else {
      console.log('⚠️ Could not fetch all records to check content existence');
    }

  } catch (error) {
    console.error('❌ Diagnosis failed:', error);
  }
}

// Run the diagnosis
diagnoseLanceDBSchema().catch(console.error);
