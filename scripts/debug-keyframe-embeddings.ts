#!/usr/bin/env tsx

import { LanceDBIngestionService } from '../lib/lancedb-ingestion';

async function debugKeyframeEmbeddings() {
  console.log('🔍 Debugging keyframe embedding generation...');

  const ingestionService = new LanceDBIngestionService();

  try {
    // Step 1: Load a keyframe
    console.log('\n📁 Step 1: Loading a keyframe...');
    const { listMediaAssets } = await import('../lib/media-storage');

    const mediaResult = await listMediaAssets(undefined, {
      loadAll: true,
      excludeKeyframes: false
    });

    const keyframes = mediaResult.assets.filter(asset => asset.media_type === 'keyframe_still');
    console.log(`✅ Found ${keyframes.length} keyframes`);

    if (keyframes.length === 0) {
      console.log('❌ No keyframes found');
      return;
    }

    const sampleKeyframe = keyframes[0];
    console.log(`\n📋 Sample keyframe: ${sampleKeyframe.title}`);
    console.log(`   - ID: ${sampleKeyframe.id}`);
    console.log(`   - AI Labels: ${JSON.stringify(sampleKeyframe.ai_labels, null, 2)}`);

    // Step 2: Process the keyframe
    console.log('\n📤 Step 2: Processing keyframe...');
    const record = await ingestionService.processMediaAsset(sampleKeyframe);

    console.log(`✅ Processed record:`);
    console.log(`   - ID: ${record.id}`);
    console.log(`   - Content Type: ${record.content_type}`);
    console.log(`   - Title: ${record.title}`);
    console.log(`   - Combined Text: ${record.combined_text.substring(0, 200)}...`);
    console.log(`   - Embedding Length: ${record.embedding.length}`);
    console.log(`   - Embedding Sample: [${record.embedding.slice(0, 5).join(', ')}, ...]`);

    // Step 3: Test embedding generation directly
    console.log('\n🧮 Step 3: Testing embedding generation...');
    const testText = record.combined_text;
    const embedding = await ingestionService.generateEmbedding(testText);

    console.log(`✅ Generated embedding:`);
    console.log(`   - Length: ${embedding.length}`);
    console.log(`   - Sample: [${embedding.slice(0, 5).join(', ')}, ...]`);
    console.log(`   - Matches record: ${JSON.stringify(embedding.slice(0, 5)) === JSON.stringify(record.embedding.slice(0, 5))}`);

    // Step 4: Check if LanceDB has the record
    console.log('\n🔍 Step 4: Checking LanceDB for the record...');
    const lancedbUrl = process.env.LANCEDB_API_URL || 'http://lanced-LoadB-oFgwzoUCRPPr-1582930674.us-east-1.elb.amazonaws.com';

    try {
      const response = await fetch(`${lancedbUrl}/get/${record.id}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      console.log(`Response status: ${response.status}`);

      if (response.ok) {
        const result = await response.json();
        console.log(`✅ Found in LanceDB: ${result.title} (${result.content_type})`);
        console.log(`   - Has embedding: ${result.embedding ? 'Yes' : 'No'}`);
        if (result.embedding) {
          console.log(`   - Embedding length: ${result.embedding.length}`);
        }
      } else {
        const errorText = await response.text();
        console.error(`❌ Not found in LanceDB: ${errorText}`);
      }
    } catch (error) {
      console.error('LanceDB get error:', error);
    }

  } catch (error) {
    console.error('❌ Debug failed:', error);
  }
}

debugKeyframeEmbeddings().catch(console.error);
