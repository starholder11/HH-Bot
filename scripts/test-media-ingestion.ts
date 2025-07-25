#!/usr/bin/env tsx

import { LanceDBIngestionService } from '../lib/lancedb-ingestion';

async function testMediaIngestion() {
  console.log('🧪 Testing media ingestion...');

  const ingestionService = new LanceDBIngestionService();

  try {
    // Test 1: Load media assets
    console.log('\n📁 Step 1: Loading media assets...');
    const mediaAssets = await ingestionService.loadMediaAssets();
    console.log(`✅ Loaded ${mediaAssets.length} total media assets`);

    // Count by type
    const byType = mediaAssets.reduce((acc, asset) => {
      acc[asset.media_type] = (acc[asset.media_type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log('📊 Assets by type:');
    Object.entries(byType).forEach(([type, count]) => {
      console.log(`   - ${type}: ${count}`);
    });

    // Test 2: Look for HOMBRE specifically
    console.log('\n🎵 Step 2: Looking for HOMBRE...');
    const hombreAsset = mediaAssets.find(asset =>
      asset.title.toLowerCase().includes('hombre') ||
      asset.filename.toLowerCase().includes('hombre')
    );

    if (hombreAsset) {
      console.log('✅ Found HOMBRE in media assets:');
      console.log(`   - Title: ${hombreAsset.title}`);
      console.log(`   - Filename: ${hombreAsset.filename}`);
      console.log(`   - Type: ${hombreAsset.media_type}`);
      console.log(`   - Styles: ${hombreAsset.ai_labels.style.join(', ')}`);
      console.log(`   - Mood: ${hombreAsset.ai_labels.mood.join(', ')}`);
      console.log(`   - Themes: ${hombreAsset.ai_labels.themes.join(', ')}`);

      // Test 3: Process HOMBRE for LanceDB
      console.log('\n📤 Step 3: Processing HOMBRE for LanceDB...');
      const record = await ingestionService.processMediaAsset(hombreAsset);
      console.log('✅ HOMBRE processed for LanceDB:');
      console.log(`   - ID: ${record.id}`);
      console.log(`   - Content Type: ${record.content_type}`);
      console.log(`   - Title: ${record.title}`);
      console.log(`   - Combined Text: ${record.combined_text.substring(0, 100)}...`);

      // Test 4: Add to LanceDB
      console.log('\n💾 Step 4: Adding HOMBRE to LanceDB...');
      await ingestionService.addToLanceDB(record);
      console.log('✅ HOMBRE added to LanceDB!');

    } else {
      console.log('❌ HOMBRE not found in media assets');

      // Show some audio assets
      const audioAssets = mediaAssets.filter(a => a.media_type === 'audio');
      console.log(`\n📋 Sample audio assets (${audioAssets.length} total):`);
      audioAssets.slice(0, 5).forEach(asset => {
        console.log(`   - "${asset.title}" (${asset.filename})`);
      });
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testMediaIngestion().catch(console.error);
