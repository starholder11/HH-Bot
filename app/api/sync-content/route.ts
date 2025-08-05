import { NextRequest, NextResponse } from 'next/server';
import { validateGitHubWebhook, extractGitHubSignature } from '@/lib/webhook-security';
import { syncTimelineEntry, getFileContentFromGitHub } from '@/lib/openai-sync';
import { uploadImage, uploadFile } from '@/lib/s3-upload';
import { updateFileInGitHub, replaceImageReferences, getFileContentAsString } from '@/lib/github-file-updater';
// import { updateSearchIndexFile } from '@/lib/search/search-index';
import path from 'path';
import { enqueueAnalysisJob } from '@/lib/queue';

// Ensure this route runs in the Node.js runtime (Edge runtime disallows `path` module)
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
    console.log('🔔 WEBHOOK-LIVE (Node runtime) v3 - COMPREHENSIVE LOGGING');

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

    // Extract branch from payload (e.g., "refs/heads/main" -> "main")
    const branch = payload.ref.replace('refs/heads/', '');
    console.log('🌿 Processing webhook for branch:', branch);

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
          console.log('🔍 DEBUG: File in timeline directory:', file);
          console.log('🔍 DEBUG: File ends with .mdx:', file.endsWith('.mdx'));
          console.log('🔍 DEBUG: File matches image pattern:', /\.(png|jpg|jpeg|gif|webp)$/i.test(file));

          // Use path.extname to avoid false negatives (e.g. hidden unicode / whitespace)
          const ext = path.extname(file).toLowerCase();
          console.log('🔍 DEBUG: File extension detected:', ext);
          
          if (ext === '.mdx' || ext === '.mdoc') {
            timelineFiles.add(file);
            console.log('✅ ADDED TO TIMELINE FILES FOR PROCESSING:', file);
          } else if (/\.(png|jpg|jpeg|gif|webp)$/i.test(file)) {
            imageFiles.add(file);
            console.log('🖼️ Added to image files:', file);
          } else {
            console.log('⚠️ TIMELINE FILE IGNORED (wrong extension):', file, 'extension:', ext);
          }
        } else {
          console.log('⚠️ FILE IGNORED (not in timeline):', file);
        }
      });
    }

    console.log('🔍 DEBUG: Image files detected:', Array.from(imageFiles));
    console.log('🔍 DEBUG: Content files detected:', Array.from(timelineFiles));

    // -----
    // Enqueue LanceDB / OpenAI processing via SQS (text pipeline)
    // -----
    for (const filePath of Array.from(timelineFiles)) {
      try {
        const segments = filePath.split('/');
        const fileNameWithExt = segments.pop() || 'content.mdx';
        const entrySlugRaw = segments.pop() || 'unknown-entry';
        const baseName = entrySlugRaw.replace(/\s+/g, '-').toLowerCase();

        await enqueueAnalysisJob({
          assetId: baseName,
          mediaType: 'text',
          sourcePath: filePath,
          gitRef: branch,
          title: baseName,
          requestedAt: Date.now(),
        });
        console.log(`📤 Enqueued analysis job for ${baseName}`);
      } catch (enqueueErr) {
        console.error('⚠️ Failed to enqueue text analysis job', enqueueErr);
      }
    }

    return NextResponse.json({
      message: 'Jobs enqueued',
      queued: timelineFiles.size,
    });

    // Process image files first (upload to S3)
    if (imageFiles.size > 0) {
      console.log(`🖼️ Processing ${imageFiles.size} image file(s) for S3 upload`);

      for (const imagePath of Array.from(imageFiles)) {
        try {
          // Get file content from GitHub API (binary file) using branch instead of commit SHA
          const fileContent = await getFileContentFromGitHub(imagePath, branch, true);

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
      console.log('❌ NO TIMELINE FILES FOUND FOR PROCESSING');
      console.log('📋 Files that were checked:', allChangedFiles);
      console.log('📋 Total commits processed:', payload.commits.length);
      return NextResponse.json({
        message: 'No timeline files to sync',
        imageUploads: Object.keys(urlMappings).length,
        debug: {
          allChangedFiles,
          commitsProcessed: payload.commits.length,
          timelineFilesFound: 0
        }
      });
    }

    console.log(`📝 PROCESSING ${timelineFiles.size} TIMELINE FILE(S):`, Array.from(timelineFiles));

    // Sync each changed timeline file and update with S3 URLs if needed
    const syncResults = [];

    for (const filePath of Array.from(timelineFiles)) {
      try {
        // Get file content from GitHub API using branch
        const fileContent = await getFileContentFromGitHub(
          filePath,
          branch
        );

        // Get filename and base name
        const segments = filePath.split('/');
        const fileNameWithExt = segments.pop() || 'body.mdoc';
        const entrySlugRaw = segments.pop() || 'unknown-entry';
        const baseName = entrySlugRaw.replace(/\s+/g, '-').toLowerCase();
        const fileName = fileNameWithExt; // keep for later log / commit messages

        console.log(`🔄 PROCESSING ENTRY: ${filePath}`);
        console.log(`   📁 Folder name: ${entrySlugRaw}`);
        console.log(`   🏷️ Base name: ${baseName}`);
        console.log(`   📄 File name: ${fileName}`);
        console.log(`   📝 Content length: ${fileContent.length} chars`);

        // Enqueue job for parallel ingestion pipeline (text)
        try {
          await enqueueAnalysisJob({
            assetId: baseName,
            mediaType: 'text',
            sourcePath: filePath,
            title: baseName,
            requestedAt: Date.now(),
          });
          console.log(`📤 Enqueued analysis job for ${baseName}`);
        } catch (queueErr) {
          console.error('⚠️ Failed to enqueue analysis job', queueErr);
        }

        // Sync to vector store with file content
        console.log(`🚀 CALLING syncTimelineEntry(${baseName}, [content])`);
        await syncTimelineEntry(baseName, fileContent);
        console.log(`✅ SUCCESSFULLY SYNCED: ${baseName}`);

        // If we have S3 URL mappings, update the content file
        if (Object.keys(urlMappings).length > 0) {
          try {
            // Get current content as string using branch
            const currentContent = await getFileContentAsString(filePath, branch);

            // Replace image references with S3 URLs
            const updatedContent = replaceImageReferences(currentContent, urlMappings);

            // Only update if content actually changed
            if (updatedContent !== currentContent) {
                              await updateFileInGitHub({
                  filePath,
                  newContent: updatedContent,
                  commitMessage: `Auto-update: Replace local images with S3 URLs in ${fileName}`,
                  branch: branch // Use dynamic branch instead of hardcoded main
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
        console.error(`❌ FAILED TO SYNC ${filePath}:`, error);
        console.error(`❌ ERROR DETAILS:`, error instanceof Error ? error.stack : error);
        syncResults.push({
          file: filePath,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
          errorStack: error instanceof Error ? error.stack : undefined
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
