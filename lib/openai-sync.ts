import OpenAI from 'openai';
import { 
  generateOpenAIFileName, 
  generateContentHash, 
  prepareContentForOpenAI 
} from './content-processor';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface TimelineEntry {
  slug: string;
  title: string;
  date: string;
  body: any;
  openaiFileId?: string;
  openaiFileName?: string;
  lastSyncedAt?: string;
  contentHash?: string;
}

interface SyncResult {
  success: boolean;
  fileId: string;
  fileName: string;
  action: 'created' | 'updated' | 'skipped';
  error?: string;
}

/**
 * Sync a single timeline entry to OpenAI
 */
export async function syncTimelineEntry(entry: TimelineEntry): Promise<SyncResult> {
  const fileName = generateOpenAIFileName(entry.slug);
  const content = prepareContentForOpenAI(entry);
  const contentHash = generateContentHash(content);
  
  console.log(`🔄 Syncing entry: ${entry.slug}`);
  
  try {
    // Check if content has changed
    if (entry.contentHash && entry.contentHash === contentHash) {
      console.log(`⏭️  Content unchanged for ${entry.slug}, skipping sync`);
      return {
        success: true,
        fileId: entry.openaiFileId || '',
        fileName: entry.openaiFileName || fileName,
        action: 'skipped'
      };
    }
    
    // If we have an existing file ID, delete the old file from vector store first
    if (entry.openaiFileId) {
      try {
        const VECTOR_STORE_ID = "vs_6860128217f08191bacd30e1475d8566";
        await openai.vectorStores.files.del(VECTOR_STORE_ID, entry.openaiFileId);
        console.log(`🗑️  Deleted old file from vector store: ${entry.openaiFileId}`);
      } catch (error: any) {
        console.warn(`⚠️  Could not delete old file ${entry.openaiFileId}:`, error.message);
        // Continue anyway - file might already be deleted
      }
    }
    
    // Upload directly to vector store (like the original implementation)
    const VECTOR_STORE_ID = "vs_6860128217f08191bacd30e1475d8566";
    
    // Convert string content to Buffer for upload
    const buffer = Buffer.from(content, 'utf8');
    const file = new File([buffer], fileName, { type: 'text/markdown' });
    
    // Upload to vector store using the original API method
    const vectorStoreFile = await openai.vectorStores.files.upload(
      VECTOR_STORE_ID,
      file
    );
    
    console.log(`✅ Uploaded to vector store: ${fileName} → ${vectorStoreFile.id}`);
    
    return {
      success: true,
      fileId: vectorStoreFile.id,
      fileName: fileName,
      action: entry.openaiFileId ? 'updated' : 'created'
    };
    
  } catch (error: any) {
    console.error(`❌ Failed to sync ${entry.slug}:`, error);
    return {
      success: false,
      fileId: '',
      fileName: fileName,
      action: 'created',
      error: error.message
    };
  }
}

/**
 * Sync multiple timeline entries with error handling
 */
export async function syncMultipleEntries(entries: TimelineEntry[]): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  
  console.log(`🚀 Starting sync of ${entries.length} entries`);
  
  for (const entry of entries) {
    try {
      const result = await syncTimelineEntry(entry);
      results.push(result);
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error: any) {
      console.error(`💥 Unexpected error syncing ${entry.slug}:`, error);
      results.push({
        success: false,
        fileId: '',
        fileName: generateOpenAIFileName(entry.slug),
        action: 'created',
        error: error.message
      });
    }
  }
  
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log(`📊 Sync completed: ${successful} successful, ${failed} failed`);
  
  return results;
}



// Legacy functions for backward compatibility (if needed)
export async function uploadFileToVectorStore(fileContent: string, fileName: string) {
  console.warn('⚠️  Legacy function called - use syncTimelineEntry instead');
  return syncTimelineEntry({
    slug: fileName.replace('.md', '').replace('-body', ''),
    title: fileName,
    date: new Date().toISOString(),
    body: fileContent
  });
}

export async function findExistingFile(fileName: string): Promise<string | null> {
  console.warn('⚠️  Legacy function called - use content hash comparison instead');
  return null;
}

export async function deleteFileFromVectorStore(fileId: string) {
  try {
    await openai.files.del(fileId);
    console.log(`🗑️  Deleted file ${fileId}`);
  } catch (error: any) {
    console.error(`❌ Error deleting file ${fileId}:`, error);
    throw error;
  }
}

export async function syncTimelineFile(fileContent: string, fileName: string) {
  console.warn('⚠️  Legacy function called - use syncTimelineEntry instead');
  return syncTimelineEntry({
    slug: fileName.replace('.md', '').replace('-body', ''),
    title: fileName,
    date: new Date().toISOString(),
    body: fileContent
  });
} 