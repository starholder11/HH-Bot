import { NextRequest, NextResponse } from 'next/server';
import { validateGitHubWebhook, extractGitHubSignature } from '@/lib/webhook-security';
import { syncTimelineFile, getFileContentFromGitHub } from '@/lib/openai-sync';
import { uploadImage, uploadFile } from '@/lib/s3-upload';
import { updateFileInGitHub, replaceImageReferences, getFileContentAsString } from '@/lib/github-file-updater';
// import { updateSearchIndexFile } from '@/lib/search/search-index';

// GitHub webhook event types
interface GitHubWebhookPayload {
  ref: string;
  commits: Array<{
    id: string;
    added: string[];
    modified: string[];
    removed: string[];
  }>;
  repository: {
    name: string;
    owner: {
      login: string;
    };
  };
}

export async function POST(request: NextRequest) {
  try {
    console.log('🔔 Received webhook request');
    
    // Get raw body for signature validation
    const rawBody = await request.text();
    
    // Validate webhook signature
    const signature = extractGitHubSignature(request.headers);
    const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
    
    if (!signature || !webhookSecret) {
      console.error('❌ Missing signature or webhook secret');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    if (!validateGitHubWebhook(rawBody, signature, webhookSecret)) {
      console.error('❌ Invalid webhook signature');
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }
    
    // Parse webhook payload
    const payload: GitHubWebhookPayload = JSON.parse(rawBody);
    
    // 🔍 DEBUG: Add comprehensive logging to understand webhook structure
    console.log('🔍 DEBUG: Full commit object:', JSON.stringify(payload.commits[0], null, 2));
    console.log('🔍 DEBUG: All commits in payload:', payload.commits.length);
    
    // Debug: Log all changed files
    const allChangedFiles = payload.commits.flatMap(commit => [
      ...commit.added,
      ...commit.modified,
      ...commit.removed
    ]);

    console.log('🔍 DEBUG: All changed files from commits:', allChangedFiles);
    console.log('📁 Looking for files starting with: content/timeline/');
    console.log('📋 Webhook payload commits:', payload.commits.length);
    
    // Process timeline content changes and image files
    const timelineFiles = new Set<string>();
    const imageFiles = new Set<string>();
    const urlMappings: Record<string, string> = {}; // Map local paths to S3 URLs
    
    for (const commit of payload.commits) {
      console.log('🔍 Commit:', commit.id, 'added:', commit.added, 'modified:', commit.modified);
      
      // Check added and modified files
      [...commit.added, ...commit.modified].forEach(file => {
        console.log('🔍 Checking file:', file, 'starts with content/timeline/:', file.startsWith('content/timeline/'));
        
        if (file.startsWith('content/timeline/')) {
          if (file.endsWith('.mdoc')) {
            timelineFiles.add(file);
            console.log('✅ Added to timeline files:', file);
          } else if (/\.(png|jpg|jpeg|gif|webp)$/i.test(file)) {
            imageFiles.add(file);
            console.log('🖼️ Added to image files:', file);
          }
        }
      });
    }
    
    console.log('🔍 DEBUG: Image files detected:', Array.from(imageFiles));
    console.log('🔍 DEBUG: Content files detected:', Array.from(timelineFiles));
    
    // Process image files first (upload to S3)
    if (imageFiles.size > 0) {
      console.log(`🖼️ Processing ${imageFiles.size} image file(s) for S3 upload`);
      
      for (const imagePath of Array.from(imageFiles)) {
        try {
          // Get file content from GitHub API (binary file)
          const fileContent = await getFileContentFromGitHub(imagePath, payload.commits[0].id, true);
          
          console.log('🔍 Base64 content received length:', fileContent.length);
          console.log('🔍 First 50 chars of base64:', fileContent.substring(0, 50));
          
          // Convert base64 to buffer
          const buffer = Buffer.from(fileContent, 'base64');
          console.log('🖼️ Starting Sharp processing...');
          console.log('📊 Buffer size:', buffer.length, 'bytes');
          console.log('📊 Buffer first 16 bytes (hex):', buffer.slice(0, 16).toString('hex'));
          
          // Get filename for S3 key
          const fileName = imagePath.split('/').pop() || 'unknown.jpg';
          
          // Upload to S3
          const result = await uploadImage(buffer, {
            quality: 85,
            maxWidth: 1920,
            maxHeight: 1080,
            format: 'jpeg'
          });
          
          // Store mapping for content updates
          urlMappings[fileName] = result.url;
          
          console.log(`✅ Uploaded ${fileName} to S3: ${result.url}`);
          
        } catch (error) {
          console.error(`❌ Failed to upload ${imagePath} to S3:`, error);
        }
      }
    }
    
    if (timelineFiles.size === 0) {
      console.log('ℹ️ No timeline files changed, skipping sync');
      return NextResponse.json({ 
        message: 'No timeline files to sync',
        imageUploads: Object.keys(urlMappings).length
      });
    }
    
    console.log(`📝 Processing ${timelineFiles.size} timeline file(s)`);
    
    // Sync each changed timeline file and update with S3 URLs if needed
    const syncResults = [];
    
    for (const filePath of Array.from(timelineFiles)) {
      try {
        // Get file content from GitHub API
        const fileContent = await getFileContentFromGitHub(
          filePath,
          payload.commits[0].id
        );
        
        // Get filename from path
        const fileName = filePath.split('/').pop() || 'unknown.md';
        
        // Sync to vector store with file content
        await syncTimelineFile(fileContent, fileName);
        
        // If we have S3 URL mappings, update the content file
        if (Object.keys(urlMappings).length > 0) {
          try {
            // Get current content as string (use same commit SHA as image download)
            const currentContent = await getFileContentAsString(filePath, payload.commits[0].id);
            
            // Replace image references with S3 URLs
            const updatedContent = replaceImageReferences(currentContent, urlMappings);
            
            // Only update if content actually changed
            if (updatedContent !== currentContent) {
              await updateFileInGitHub({
                filePath,
                newContent: updatedContent,
                commitMessage: `Auto-update: Replace local images with S3 URLs in ${fileName}`,
                ref: payload.commits[0].id // Use commit SHA for consistency
              });
              
              console.log(`🔄 Updated ${fileName} with S3 URLs`);
            }
          } catch (updateError) {
            console.error(`⚠️ Failed to update ${fileName} with S3 URLs:`, updateError);
            // Don't fail the entire sync for this
          }
        }
        
        syncResults.push({
          file: fileName,
          status: 'success'
        });
        
        console.log(`✅ Synced ${fileName}`);
        
      } catch (error) {
        console.error(`❌ Failed to sync ${filePath}:`, error);
        syncResults.push({
          file: filePath,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    const successCount = syncResults.filter(r => r.status === 'success').length;
    const errorCount = syncResults.filter(r => r.status === 'error').length;
    
    console.log(`🎉 Sync complete: ${successCount} successful, ${errorCount} errors`);
    
    return NextResponse.json({
      message: 'Sync completed',
      results: syncResults,
      summary: {
        total: timelineFiles.size,
        successful: successCount,
        errors: errorCount
      },
      s3Processing: {
        imagesProcessed: imageFiles.size,
        urlMappings: Object.keys(urlMappings).length,
        mappings: urlMappings
      },
      searchIndexUpdated: false
    });
    
  } catch (error) {
    console.error('❌ Webhook processing error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Handle other HTTP methods
export async function GET() {
  return NextResponse.json(
    { message: 'Webhook endpoint - POST only' },
    { status: 405 }
  );
} 