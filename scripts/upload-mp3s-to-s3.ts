#!/usr/bin/env tsx

import * as dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { uploadAudioToS3, generateUniqueFilename } from '../lib/s3-config';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

async function uploadAllMP3sToS3() {
  console.log('🚀 Uploading MP3s to S3...');

  const audioSourcesDir = path.join(process.cwd(), 'audio-sources');
  const dataDir = path.join(audioSourcesDir, 'data');

  // Check if S3 is configured
  if (!process.env.S3_BUCKET_NAME) {
    console.error('❌ S3_BUCKET_NAME not configured in .env.local');
    console.log('💡 Add your S3 configuration to .env.local first');
    return;
  }

  // Get all JSON files (songs)
  const dataFiles = await fs.readdir(dataDir);
  const jsonFiles = dataFiles.filter(file => file.endsWith('.json'));

  console.log(`Found ${jsonFiles.length} songs to upload`);

  let uploadedCount = 0;
  let skippedCount = 0;

  for (const jsonFile of jsonFiles) {
    try {
      const jsonPath = path.join(dataDir, jsonFile);
      const songData = JSON.parse(await fs.readFile(jsonPath, 'utf-8'));

      // Skip if already uploaded (has real S3 URL)
      if (songData.s3_url && !songData.s3_url.includes('your-bucket')) {
        console.log(`⏭️  Already uploaded: ${songData.title}`);
        skippedCount++;
        continue;
      }

      // Find the MP3 file
      const mp3Path = path.join(audioSourcesDir, songData.filename);

      try {
        await fs.access(mp3Path);
      } catch (error) {
        console.warn(`⚠️  MP3 not found: ${songData.filename}`);
        skippedCount++;
        continue;
      }

      // Read MP3 file as buffer and convert to File-like object
      const mp3Buffer = await fs.readFile(mp3Path);
      const mp3File = new File([mp3Buffer], songData.filename, { type: 'audio/mpeg' });

      // Generate unique filename and upload
      const uniqueFilename = generateUniqueFilename(songData.filename);
      console.log(`📤 Uploading: ${songData.title}...`);

      const uploadResult = await uploadAudioToS3(mp3File, uniqueFilename);

      // Update song data with real S3 URLs
      songData.s3_url = uploadResult.s3_url;
      songData.cloudflare_url = uploadResult.cloudflare_url;
      songData.updated_at = new Date().toISOString();

      // Save updated data
      await fs.writeFile(jsonPath, JSON.stringify(songData, null, 2));

      uploadedCount++;
      console.log(`✅ Uploaded: ${songData.title}`);

    } catch (error) {
      console.error(`❌ Error uploading ${jsonFile}:`, error);
      skippedCount++;
    }
  }

  console.log(`\n🎉 Upload complete!`);
  console.log(`   ✅ Uploaded: ${uploadedCount} files`);
  console.log(`   ⏭️  Skipped: ${skippedCount} files`);
  console.log(`   🌐 Your songs are now streamable from CloudFlare CDN!`);
}

// Run the script
uploadAllMP3sToS3().catch(console.error);
