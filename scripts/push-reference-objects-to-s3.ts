import fs from 'fs/promises';
import path from 'path';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getS3Client, getBucketName } from '../lib/s3-config';

async function pushReferenceObjectsToS3() {
  const s3 = getS3Client();
  const bucket = getBucketName();
  const localDir = path.join(process.cwd(), 'media-sources', 'assets');
  const prefix = process.env.MEDIA_DATA_PREFIX || 'media-labeling/assets/';

  try {
    const files = await fs.readdir(localDir);
    const objectFiles = files.filter(file => 
      (file.startsWith('obj_') || file.startsWith('objcol_')) && file.endsWith('.json')
    );

    console.log(`Found ${objectFiles.length} reference object files to upload:`);
    
    for (const file of objectFiles) {
      try {
        const localPath = path.join(localDir, file);
        const content = await fs.readFile(localPath, 'utf-8');
        const s3Key = `${prefix}${file}`;
        
        console.log(`Uploading ${file} to s3://${bucket}/${s3Key}`);
        
        await s3.send(new PutObjectCommand({
          Bucket: bucket,
          Key: s3Key,
          Body: content,
          ContentType: 'application/json',
          CacheControl: 'max-age=31536000'
        }));
        
        console.log(`✅ Uploaded ${file}`);
      } catch (error) {
        console.error(`❌ Failed to upload ${file}:`, error);
      }
    }
    
    console.log(`\n🎉 Successfully uploaded ${objectFiles.length} reference objects to S3!`);
    console.log('Objects should now be visible in the library when filtering by "Objects"');
    
  } catch (error) {
    console.error('Failed to push objects to S3:', error);
    process.exit(1);
  }
}

pushReferenceObjectsToS3().catch(console.error);
