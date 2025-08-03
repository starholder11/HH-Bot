#!/usr/bin/env tsx

/**
 * Test single media asset ingestion to verify data extraction
 * Usage: npm run test-single-media -- [video|audio|image] [asset-id]
 */

import '../scripts/bootstrap-env';
import { ParallelIngestionService } from '../lib/parallel-ingestion';
import { getMediaAsset } from '../lib/media-storage';

async function testSingleAsset(mediaType: 'video' | 'audio' | 'image', assetId?: string) {
  console.log(`🧪 Testing ${mediaType} asset ingestion...`);
  
  try {
    let asset;
    
    if (assetId) {
      // Test specific asset
      asset = await getMediaAsset(assetId);
      if (!asset) {
        console.error(`❌ Asset ${assetId} not found`);
        return;
      }
      if (asset.media_type !== mediaType && !(mediaType === 'image' && asset.media_type === 'keyframe_still')) {
        console.error(`❌ Asset ${assetId} is type ${asset.media_type}, not ${mediaType}`);
        return;
      }
    } else {
      // Find a sample asset of the requested type
      const { listMediaAssets } = await import('../lib/media-storage');
      const { assets } = await listMediaAssets(mediaType, { limit: 1 });
      
      if (assets.length === 0) {
        console.error(`❌ No ${mediaType} assets found`);
        return;
      }
      
      asset = assets[0];
    }
    
    console.log(`📄 Testing asset: ${asset.title} (${asset.id})`);
    console.log(`📄 Media type: ${asset.media_type}`);
    
    // Convert to ContentItem format
    console.log('\n🔄 Converting to ContentItem...');
    const contentItem = ParallelIngestionService.mediaAssetToContentItem(asset);
    
    console.log('\n=== CONTENT ITEM RESULT ===');
    console.log(`ID: ${contentItem.id}`);
    console.log(`Title: ${contentItem.title}`);
    console.log(`Content Type: ${contentItem.content_type}`);
    console.log(`\nCombined Text (${contentItem.combinedText.length} chars):`);
    console.log('─'.repeat(80));
    console.log(contentItem.combinedText);
    console.log('─'.repeat(80));
    
    // Show original AI labels for comparison
    console.log('\n=== ORIGINAL AI LABELS ===');
    if (asset.ai_labels?.overall_analysis) {
      console.log('Overall Analysis:', JSON.stringify(asset.ai_labels.overall_analysis, null, 2));
    }
    console.log('Scenes:', asset.ai_labels?.scenes || []);
    console.log('Objects:', asset.ai_labels?.objects || []);
    console.log('Style:', asset.ai_labels?.style || []);
    console.log('Mood:', asset.ai_labels?.mood || []);
    console.log('Themes:', asset.ai_labels?.themes || []);
    
    // For audio, show lyrics/prompt
    if (asset.media_type === 'audio') {
      console.log('\n=== AUDIO-SPECIFIC DATA ===');
      console.log('Lyrics:', ('lyrics' in asset) ? asset.lyrics : 'N/A');
      console.log('Prompt:', ('prompt' in asset) ? asset.prompt : 'N/A');
    }
    
    // Test embedding generation (without storing)
    console.log('\n🔄 Testing embedding generation...');
    try {
      const ingestionService = new ParallelIngestionService();
      // Use the private method for testing
      const embedding = await (ingestionService as any).generateEmbedding(contentItem.combinedText);
      console.log(`✅ Generated embedding: ${embedding.length} dimensions`);
    } catch (error) {
      console.log('⚠️  Embedding generation skipped (OpenAI not configured)');
    }
    
    console.log('\n🎉 Single asset test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

async function main() {
  const [mediaTypeArg, assetId] = process.argv.slice(2);
  
  if (!mediaTypeArg || !['video', 'audio', 'image'].includes(mediaTypeArg)) {
    console.error('Usage: npm run test-single-media -- [video|audio|image] [optional-asset-id]');
    console.error('Examples:');
    console.error('  npm run test-single-media -- video');
    console.error('  npm run test-single-media -- audio');
    console.error('  npm run test-single-media -- video 8360879c-a8b7-4f9b-b11a-f2c01090dde7');
    process.exit(1);
  }
  
  const mediaType = mediaTypeArg as 'video' | 'audio' | 'image';
  await testSingleAsset(mediaType, assetId);
}

if (require.main === module) {
  main().catch(console.error);
}