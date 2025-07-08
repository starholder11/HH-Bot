import { NextResponse } from 'next/server';
import { createReader } from '@keystatic/core/reader';
import config from '../../../keystatic.config';
import { syncMultipleEntries } from '@/lib/openai-sync';
import { batchUpdateYAMLFiles } from '@/lib/yaml-updater';
import { generateContentHash, prepareContentForOpenAI } from '@/lib/content-processor';

export async function GET() {
  console.log('🧪 Testing new sync logic...');
  
  try {
    // Get all timeline entries from Keystatic
    const reader = createReader(process.cwd(), config);
    const entries = await reader.collections.timeline.all();
    
    console.log(`📚 Found ${entries.length} timeline entries`);
    
    // Prepare entries for sync
    const entriesToSync = entries.map(({ slug, entry }) => ({
      slug,
      title: entry.title || slug,
      date: entry.date || new Date().toISOString(),
      body: entry.body,
      openaiFileId: entry.openaiFileId,
      openaiFileName: entry.openaiFileName,
      lastSyncedAt: entry.lastSyncedAt,
      contentHash: entry.contentHash
    }));
    
    console.log('📋 Entries to sync:', entriesToSync.map(e => ({ slug: e.slug, title: e.title })));
    
    // Sync to OpenAI
    const syncResults = await syncMultipleEntries(entriesToSync);
    
    console.log('📊 Sync results:', syncResults);
    
    // Prepare YAML updates for successful syncs
    const yamlUpdates = syncResults
      .filter(result => result.success && result.action !== 'skipped')
      .map(result => {
        const entry = entriesToSync.find(e => 
          result.fileName.startsWith(e.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-'))
        );
        
        if (!entry) {
          console.warn(`Could not find entry for result: ${result.fileName}`);
          return null;
        }
        
        const content = prepareContentForOpenAI(entry);
        
        return {
          slug: entry.slug,
          data: {
            openaiFileId: result.fileId,
            openaiFileName: result.fileName,
            lastSyncedAt: new Date().toISOString(),
            contentHash: generateContentHash(content)
          }
        };
      })
      .filter((update): update is { slug: string; data: any } => update !== null);
    
    // Update YAML files with sync metadata
    if (yamlUpdates.length > 0) {
      await batchUpdateYAMLFiles(yamlUpdates);
    }
    
    // Success response
    const successful = syncResults.filter(r => r.success).length;
    const failed = syncResults.filter(r => !r.success).length;
    const skipped = syncResults.filter(r => r.action === 'skipped').length;
    
    return NextResponse.json({ 
      success: true,
      message: 'Test sync completed successfully',
      stats: {
        total: entries.length,
        successful,
        failed,
        skipped
      },
      details: syncResults
    });
    
  } catch (error: any) {
    console.error('❌ Test sync failed:', error);
    
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    }, { 
      status: 500 
    });
  }
} 