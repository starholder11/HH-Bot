#!/usr/bin/env tsx

import { listMediaAssets } from '../lib/media-storage';
import { listSongs } from '../lib/song-storage';

async function testS3Access() {
  console.log('🔍 Testing S3 access for media content...\n');

  // Test media assets
  try {
    console.log('📁 Testing media assets access...');
    const result = await listMediaAssets(undefined, { loadAll: true, excludeKeyframes: true });
    console.log(`✅ Media assets access works: ${result.assets.length} assets found`);

    if (result.assets.length > 0) {
      const mediaTypes = result.assets.reduce((acc, asset) => {
        acc[asset.media_type] = (acc[asset.media_type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      console.log('Media types found:', mediaTypes);

      // Show sample asset
      const sample = result.assets[0];
      console.log('Sample asset:', sample.title);
      console.log('Has AI labels:', !!sample.ai_labels);
      console.log('AI label counts:', {
        scenes: sample.ai_labels?.scenes?.length || 0,
        objects: sample.ai_labels?.objects?.length || 0,
        style: sample.ai_labels?.style?.length || 0,
        mood: sample.ai_labels?.mood?.length || 0,
        themes: sample.ai_labels?.themes?.length || 0
      });
    }
  } catch (error) {
    console.log('❌ Media assets access failed:', error.message);
  }

  console.log('');

  // Test songs/audio
  try {
    console.log('🎵 Testing songs access...');
    const songs = await listSongs();
    console.log(`✅ Songs access works: ${songs.length} songs found`);

    if (songs.length > 0) {
      const sample = songs[0];
      console.log('Sample song:', sample.title);
      console.log('Has auto_analysis:', !!sample.auto_analysis);
      console.log('Has enhanced_analysis:', !!sample.auto_analysis?.enhanced_analysis);
      if (sample.auto_analysis?.enhanced_analysis) {
        const enhanced = sample.auto_analysis.enhanced_analysis;
        console.log('Enhanced analysis:', {
          styles: enhanced.styles?.length || 0,
          mood: enhanced.mood?.length || 0,
          themes: enhanced.themes?.length || 0,
          primary_genre: enhanced.primary_genre
        });
      }
    }
  } catch (error) {
    console.log('❌ Songs access failed:', error.message);
  }

  console.log('\n🎯 Summary:');
  console.log('If both access methods work, we can run full ingestion.');
  console.log('If they fail, we need AWS credentials configured.');
}

testS3Access();
