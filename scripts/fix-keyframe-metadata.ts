#!/usr/bin/env tsx

/**
 * Fix keyframe metadata ingestion by fetching directly from S3 and re-ingesting
 * Bypasses Vercel API cache issues
 */

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { ParallelIngestionService } from '../lib/ingestion/ParallelIngestionService';

const s3Client = new S3Client({ region: 'us-east-1' });

async function fetchKeyframeFromS3(keyframeId: string) {
  const s3Key = `media-labeling/assets/keyframes/${keyframeId}.json`;
  const command = new GetObjectCommand({
    Bucket: 'hh-bot-images-2025-prod',
    Key: s3Key
  });
  
  const response = await s3Client.send(command);
  const bodyText = await response.Body!.transformToString();
  return JSON.parse(bodyText);
}

async function fixKeyframeMetadata() {
  const keyframeIds = [
    'ecb8e98d-1349-4003-8c94-f1adf6652f16', // Frame 1
    '99bc28b6-15cb-4844-9696-d514e6a61ac5', // Frame 4  
    '960b7ca3-94bf-4b34-8244-023af0d4b5c8'  // Frame 5
  ];

  console.log(`🔧 Fixing metadata for ${keyframeIds.length} Face_ill_rotate keyframes...`);
  
  const ingestionService = new ParallelIngestionService();
  
  for (const keyframeId of keyframeIds) {
    try {
      console.log(`\n📥 Fetching keyframe ${keyframeId} from S3...`);
      const keyframe = await fetchKeyframeFromS3(keyframeId);
      
      console.log(`✅ Retrieved: ${keyframe.title}`);
      console.log(`AI Status: ${keyframe.processing_status?.ai_labeling}`);
      
      if (keyframe.ai_labels?.scenes) {
        const sceneText = keyframe.ai_labels.scenes[0];
        console.log(`Scene length: ${sceneText.length} chars`);
        console.log(`Scene preview: ${sceneText.substring(0, 100)}...`);
      }
      
      console.log(`🔄 Re-ingesting with full metadata (upsert mode)...`);
      
      const contentItem = ParallelIngestionService.mediaAssetToContentItem(keyframe);
      console.log(`Content item text length: ${contentItem.combinedText.length} chars`);
      
      await ingestionService.ingestWithOptimizations([contentItem], true); // true = upsert
      
      console.log(`✅ Successfully upserted keyframe ${keyframeId}`);
      
    } catch (error) {
      console.error(`❌ Failed to process keyframe ${keyframeId}:`, error);
    }
  }
  
  console.log('\n🎉 Keyframe metadata fix complete!');
}

fixKeyframeMetadata().catch(console.error);
