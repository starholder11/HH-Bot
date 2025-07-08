// Test script for new OpenAI sync logic
import { createReader } from '@keystatic/core/reader';
import config from './keystatic.config.ts';
import { syncMultipleEntries } from './lib/openai-sync.ts';
import { generateContentHash, prepareContentForOpenAI } from './lib/content-processor.ts';

async function testNewSync() {
  console.log('🧪 Testing new OpenAI sync logic...');
  
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
    
    const successful = syncResults.filter(r => r.success).length;
    const failed = syncResults.filter(r => !r.success).length;
    const skipped = syncResults.filter(r => r.action === 'skipped').length;
    
    console.log(`✅ Sync completed: ${successful} successful, ${failed} failed, ${skipped} skipped`);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testNewSync(); 