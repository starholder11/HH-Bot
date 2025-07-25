#!/usr/bin/env tsx

import { listSongs } from '../lib/song-storage';

async function checkHombre() {
  try {
    console.log('🔍 Checking for HOMBRE in audio data...');

    const songs = await listSongs();
    console.log(`📊 Total songs loaded: ${songs.length}`);

    const hombreSongs = songs.filter(s =>
      s.title.toLowerCase().includes('hombre') ||
      s.filename.toLowerCase().includes('hombre')
    );

    console.log(`🎵 HOMBRE matches found: ${hombreSongs.length}`);

    hombreSongs.forEach(song => {
      console.log(`✅ Found: "${song.title}" (${song.filename})`);
      console.log(`   - ID: ${song.id}`);
      console.log(`   - S3 URL: ${song.s3_url}`);
      console.log(`   - Cloudflare URL: ${song.cloudflare_url}`);
      console.log(`   - Styles: ${song.auto_analysis?.enhanced_analysis?.styles?.join(', ') || 'None'}`);
      console.log(`   - Mood: ${song.auto_analysis?.enhanced_analysis?.mood?.join(', ') || 'None'}`);
      console.log(`   - Themes: ${song.auto_analysis?.enhanced_analysis?.themes?.join(', ') || 'None'}`);
      console.log('');
    });

    if (hombreSongs.length === 0) {
      console.log('❌ No HOMBRE songs found in audio data');

      // Show some sample songs
      console.log('\n📋 Sample songs:');
      songs.slice(0, 5).forEach(song => {
        console.log(`   - "${song.title}" (${song.filename})`);
      });
    }

  } catch (error) {
    console.error('❌ Error checking for HOMBRE:', error);
  }
}

checkHombre().catch(console.error);
