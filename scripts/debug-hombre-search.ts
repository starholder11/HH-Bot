#!/usr/bin/env tsx

import { LanceDBIngestionService } from '../lib/lancedb-ingestion';

async function debugHombreSearch() {
  console.log('🔍 Debugging HOMBRE search...');

  const ingestionService = new LanceDBIngestionService();

  try {
    // Step 1: Load media assets
    console.log('\n📁 Step 1: Loading media assets...');
    const mediaAssets = await ingestionService.loadMediaAssets();
    console.log(`✅ Loaded ${mediaAssets.length} media assets`);

    // Step 2: Look for HOMBRE specifically
    console.log('\n🎵 Step 2: Looking for HOMBRE in media assets...');
    const hombreAsset = mediaAssets.find(asset =>
      asset.title.toLowerCase().includes('hombre') ||
      asset.filename.toLowerCase().includes('hombre')
    );

    if (hombreAsset) {
      console.log('✅ Found HOMBRE in media assets:');
      console.log(`   - Title: ${hombreAsset.title}`);
      console.log(`   - Filename: ${hombreAsset.filename}`);
      console.log(`   - Type: ${hombreAsset.media_type}`);
      console.log(`   - ID: ${hombreAsset.id}`);

      // Step 3: Test searchable text creation
      console.log('\n📝 Step 3: Testing searchable text creation...');
      const searchableText = [
        hombreAsset.title,
        hombreAsset.filename,
        hombreAsset.ai_labels?.scenes?.join(' '),
        hombreAsset.ai_labels?.objects?.join(' '),
        hombreAsset.ai_labels?.style?.join(' '),
        hombreAsset.ai_labels?.mood?.join(' '),
        hombreAsset.ai_labels?.themes?.join(' ')
      ].filter(Boolean).join(' ');

      console.log(`Searchable text: "${searchableText}"`);

      // Step 4: Test similarity calculation
      console.log('\n🧮 Step 4: Testing similarity calculation...');
      const query = 'HOMBRE';
      const queryWords = query.toLowerCase().split(/\s+/);
      const textWords = searchableText.toLowerCase().split(/\s+/);

      let matchScore = 0;
      let totalWords = queryWords.length;

      for (const queryWord of queryWords) {
        if (textWords.some(word => word.includes(queryWord) || queryWord.includes(word))) {
          matchScore += 1;
        }
      }

      const similarityScore = totalWords > 0 ? matchScore / totalWords : 0;
      const filenameMatch = hombreAsset.filename.toLowerCase().includes(query.toLowerCase()) ? 0.8 : 0;
      const finalScore = Math.min(0.99, similarityScore + filenameMatch);

      console.log(`   - Query words: ${queryWords.join(', ')}`);
      console.log(`   - Text words: ${textWords.slice(0, 10).join(', ')}...`);
      console.log(`   - Match score: ${matchScore}/${totalWords} = ${similarityScore}`);
      console.log(`   - Filename match: ${filenameMatch}`);
      console.log(`   - Final score: ${finalScore} (${(finalScore * 100).toFixed(1)}%)`);

    } else {
      console.log('❌ HOMBRE not found in media assets');

      // Show audio assets
      const audioAssets = mediaAssets.filter(a => a.media_type === 'audio');
      console.log(`\n📋 Audio assets (${audioAssets.length} total):`);
      audioAssets.slice(0, 10).forEach(asset => {
        console.log(`   - "${asset.title}" (${asset.filename})`);
      });
    }

  } catch (error) {
    console.error('❌ Debug failed:', error);
  }
}

debugHombreSearch().catch(console.error);
