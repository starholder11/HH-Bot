import { NextRequest, NextResponse } from 'next/server';
import { validateGitHubWebhook, extractGitHubSignature } from '@/lib/webhook-security';
import { syncTimelineFile, getFileContentFromGitHub } from '@/lib/openai-sync';

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
    
    // Only process timeline content changes
    const timelineFiles = new Set<string>();
    
    for (const commit of payload.commits) {
      // Check added and modified files
      [...commit.added, ...commit.modified].forEach(file => {
        if (file.startsWith('content/timeline/') && file.endsWith('.md')) {
          timelineFiles.add(file);
        }
      });
      
      // Note: We'll handle deletions separately if needed
      // For now, we'll let files remain in the vector store
    }
    
    if (timelineFiles.size === 0) {
      console.log('ℹ️ No timeline files changed, skipping sync');
      return NextResponse.json({ message: 'No timeline files to sync' });
    }
    
    console.log(`📝 Processing ${timelineFiles.size} timeline file(s)`);
    
    // Sync each changed timeline file
    const syncResults = [];
    
    for (const filePath of Array.from(timelineFiles)) {
      try {
        // Get file content from GitHub API
        const fileContent = await getFileContentFromGitHub(
          filePath,
          payload.commits[0].id
        );
        
        // Create temporary file for upload
        const fileName = filePath.split('/').pop() || 'unknown.md';
        const tempFilePath = `/tmp/${fileName}`;
        
        // Write content to temp file
        const fs = require('fs');
        fs.writeFileSync(tempFilePath, fileContent);
        
        // Sync to vector store
        await syncTimelineFile(tempFilePath, fileName);
        
        // Clean up temp file
        fs.unlinkSync(tempFilePath);
        
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
      }
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