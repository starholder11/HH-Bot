#!/usr/bin/env tsx

import LanceDBIngestionService from '../lib/lancedb-ingestion';

async function testMediaLoading() {
  console.log('🔍 Testing media asset loading...\n');

  const ingestionService = new LanceDBIngestionService();

  try {
    console.log('📁 Loading media assets from S3...');
    const mediaAssets = await ingestionService.loadMediaAssets();

    console.log(`✅ Loaded ${mediaAssets.length} media assets`);

    if (mediaAssets.length > 0) {
      console.log('\n📋 Sample media assets:');
      mediaAssets.slice(0, 5).forEach((asset, index) => {
        console.log(`  ${index + 1}. ${asset.title} (${asset.media_type})`);
        console.log(`     ID: ${asset.id}`);
        console.log(`     AI Labels: ${asset.ai_labels?.scenes?.length || 0} scenes, ${asset.ai_labels?.objects?.length || 0} objects`);
        console.log(`     Style: ${asset.ai_labels?.style?.slice(0, 3).join(', ')}`);
        console.log(`     Mood: ${asset.ai_labels?.mood?.slice(0, 3).join(', ')}`);
        console.log('');
      });

      // Test filtering by media type
      const videos = mediaAssets.filter(a => a.media_type === 'video');
      const images = mediaAssets.filter(a => a.media_type === 'image');
      const audio = mediaAssets.filter(a => a.media_type === 'audio');

      console.log('📊 Media type breakdown:');
      console.log(`  Videos: ${videos.length}`);
      console.log(`  Images: ${images.length}`);
      console.log(`  Audio: ${audio.length}`);

      // Test if Barry_dinner exists
      const barryDinner = mediaAssets.find(a => a.title.includes('Barry') || a.title.includes('dinner'));
      if (barryDinner) {
        console.log('\n🎯 Found Barry dinner asset:');
        console.log(`  Title: ${barryDinner.title}`);
        console.log(`  Type: ${barryDinner.media_type}`);
        console.log(`  ID: ${barryDinner.id}`);
      } else {
        console.log('\n❌ Barry dinner asset not found');
        console.log('Available titles:', mediaAssets.slice(0, 10).map(a => a.title));
      }
    } else {
      console.log('❌ No media assets loaded');
    }

  } catch (error) {
    console.error('❌ Error loading media assets:', error);
  }
}

testMediaLoading().catch(console.error);
