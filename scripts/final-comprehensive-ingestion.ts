#!/usr/bin/env tsx

import { LanceDBIngestionService } from '../lib/lancedb-ingestion';

async function finalComprehensiveIngestion() {
  console.log('🚀 FINAL COMPREHENSIVE CONTENT INGESTION...');

  const ingestionService = new LanceDBIngestionService();
  const lancedbUrl = process.env.LANCEDB_API_URL || 'http://lanced-LoadB-oFgwzoUCRPPr-1582930674.us-east-1.elb.amazonaws.com';

  try {
    // Step 1: Load ALL content
    console.log('\n📁 Step 1: Loading ALL content...');

    // Load media assets (including keyframes)
    const mediaAssets = await ingestionService.loadMediaAssets();
    console.log(`✅ Loaded ${mediaAssets.length} total media assets`);

    const byType = mediaAssets.reduce((acc, asset) => {
      acc[asset.media_type] = (acc[asset.media_type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log('📊 Assets by type:');
    Object.entries(byType).forEach(([type, count]) => {
      console.log(`   - ${type}: ${count}`);
    });

    // Load text content
    const textContents = await ingestionService.loadTextContent();
    console.log(`✅ Loaded ${textContents.length} text files`);

    // Step 2: Ingest text content first
    console.log('\n📄 Step 2: Ingesting text content...');
    let textSuccessCount = 0;
    let textErrorCount = 0;

    for (const content of textContents) {
      try {
        const record = await ingestionService.processTextContent(content);
        await ingestionService.addToLanceDB(record);
        textSuccessCount++;
        console.log(`✅ Added text: ${content.title}`);
      } catch (error) {
        textErrorCount++;
        console.error(`❌ Failed text: ${content.title} - ${error}`);
      }
    }

    console.log(`📄 Text ingestion complete: ${textSuccessCount} success, ${textErrorCount} errors`);

    // Step 3: Ingest media content
    console.log('\n🎬 Step 3: Ingesting media content...');
    let mediaSuccessCount = 0;
    let mediaErrorCount = 0;

    for (const asset of mediaAssets) {
      try {
        const record = await ingestionService.processMediaAsset(asset);
        await ingestionService.addToLanceDB(record);
        mediaSuccessCount++;
        if (mediaSuccessCount % 50 === 0) {
          console.log(`✅ Processed ${mediaSuccessCount} media assets...`);
        }
      } catch (error) {
        mediaErrorCount++;
        console.error(`❌ Failed media: ${asset.title} - ${error}`);
      }
    }

    console.log(`🎬 Media ingestion complete: ${mediaSuccessCount} success, ${mediaErrorCount} errors`);

    // Step 4: Verify ingestion
    console.log('\n🔍 Step 4: Verifying ingestion...');

    // Test text search
    console.log('\n📄 Testing text search...');
    const textSearchResponse = await fetch(`${lancedbUrl}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'timeline', limit: 5 })
    });

    if (textSearchResponse.ok) {
      const textResults = await textSearchResponse.json();
      console.log(`✅ Text search: ${textResults.results?.length || 0} results`);
    } else {
      console.log(`❌ Text search failed: ${textSearchResponse.status}`);
    }

    // Test media search
    console.log('\n🎬 Testing media search...');
    const mediaSearchResponse = await fetch(`${lancedbUrl}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'chess', limit: 5 })
    });

    if (mediaSearchResponse.ok) {
      const mediaResults = await mediaSearchResponse.json();
      console.log(`✅ Media search: ${mediaResults.results?.length || 0} results`);
      if (mediaResults.results && mediaResults.results.length > 0) {
        console.log('Sample media results:');
        mediaResults.results.slice(0, 3).forEach((result: any, index: number) => {
          console.log(`   ${index + 1}. ${result.title} (${result.content_type}) - Score: ${(result.score * 100).toFixed(1)}%`);
        });
      }
    } else {
      console.log(`❌ Media search failed: ${mediaSearchResponse.status}`);
    }

    // Test content type filtering
    console.log('\n🎯 Testing content type filtering...');
    const contentTypes = ['text', 'image', 'video', 'audio'];

    for (const contentType of contentTypes) {
      try {
        const response = await fetch(`${lancedbUrl}/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: 'test',
            limit: 5,
            content_types: [contentType]
          })
        });

        if (response.ok) {
          const results = await response.json();
          console.log(`   ${contentType}: ${results.results?.length || 0} results`);
        } else {
          console.log(`   ${contentType}: failed (${response.status})`);
        }
      } catch (error) {
        console.log(`   ${contentType}: error`);
      }
    }

    // Step 5: Final comprehensive test
    console.log('\n🧪 Step 5: Final comprehensive test...');
    const testQueries = [
      { query: 'HOMBRE', description: 'Audio search' },
      { query: 'Barry_dinner', description: 'Video search' },
      { query: 'chess', description: 'Keyframe search' },
      { query: 'casino', description: 'Mixed content search' },
      { query: 'timeline', description: 'Text search' }
    ];

    for (const test of testQueries) {
      console.log(`\n🔍 Testing: "${test.query}" (${test.description})`);
      try {
        const response = await fetch(`${lancedbUrl}/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: test.query, limit: 5 })
        });

        if (response.ok) {
          const results = await response.json();
          console.log(`   Results: ${results.results?.length || 0}`);
          if (results.results && results.results.length > 0) {
            results.results.slice(0, 3).forEach((result: any, index: number) => {
              console.log(`   ${index + 1}. ${result.title} (${result.content_type}) - Score: ${(result.score * 100).toFixed(1)}%`);
            });
          }
        } else {
          console.log(`   Failed: ${response.status}`);
        }
      } catch (error) {
        console.error(`   Error: ${error}`);
      }
    }

    console.log('\n🎉 COMPREHENSIVE INGESTION COMPLETE!');
    console.log(`📊 Summary:`);
    console.log(`   - Text: ${textSuccessCount} ingested, ${textErrorCount} errors`);
    console.log(`   - Media: ${mediaSuccessCount} ingested, ${mediaErrorCount} errors`);
    console.log(`   - Total: ${textSuccessCount + mediaSuccessCount} records in LanceDB`);

  } catch (error) {
    console.error('❌ Comprehensive ingestion failed:', error);
  }
}

finalComprehensiveIngestion().catch(console.error);
