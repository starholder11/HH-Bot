import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import crypto from 'crypto';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// Use existing vector store ID
const VECTOR_STORE_ID = 'vs_6860128217f08191bacd30e1475d8566';

/** Utility: SHA-256 hash (hex) */
function sha256(data: string) {
  return crypto.createHash('sha256').update(data).digest('hex').slice(0, 8); // short hash for filename
}

/**
 * Robustly list *all* files in a vector store, even if the SDK version
 * doesn’t support the experimental `.iter()` helper. Falls back to the
 * classic OpenAI pagination pattern (`has_more` + `after`).
 */
async function listAllVectorStoreFiles(): Promise<any[]> {
  try {
    // First request (max 100 per docs)
    const pageSize = 100 as const;
    let page: any = await openai.vectorStores.files.list(VECTOR_STORE_ID, { limit: pageSize } as any);

    // Newer SDKs may return a PagePromise with `.iter()` – use it if present & functional
    if (typeof page?.iter === 'function') {
      const out: any[] = [];
      // NB: Need to re-request because the first call returned a *promise* we already awaited.
      const iter = (openai.vectorStores.files.list(VECTOR_STORE_ID, { limit: pageSize } as any) as any).iter();
      for await (const file of iter) {
        out.push(file);
      }
      return out;
    }

    // Fallback: old-style list response with `data` + `has_more`
    const all: any[] = [];
    all.push(...(page.data || []));
    while (page.has_more) {
      const lastId = page.data?.[page.data.length - 1]?.id;
      page = await openai.vectorStores.files.list(VECTOR_STORE_ID, { limit: pageSize, after: lastId } as any);
      all.push(...(page.data || []));
    }
    return all;
  } catch (err) {
    console.error('⚠️  Failed to list vector store files:', err);
    return [];
  }
}

/** Given a vector-store file record (which may omit `filename`), fetch its details to get the filename */
async function ensureFilename(file: any): Promise<{ id: string; filename: string }> {
  const attrName = (file.attributes as any)?.filename as string | undefined;
  if (file.filename || attrName) {
    return { id: file.id, filename: (file.filename as string) || attrName || '' };
  }
  try {
    const detailed = await openai.vectorStores.files.retrieve(
      VECTOR_STORE_ID,
      file.id
    );
    let fname: string | undefined = (detailed as any).attributes?.filename as string | undefined;
    if (!fname && (detailed as any).filename) {
      fname = (detailed as any).filename as string;
    }
    if (!fname && (detailed as any).file_id) {
      try {
        const meta = await openai.files.retrieve((detailed as any).file_id);
        fname = (meta as any).filename as string | undefined || fname;
      } catch (e) {
        // ignore
      }
    }
    return { id: file.id, filename: fname || '' };
  } catch (err) {
    console.error('⚠️  Failed to retrieve filename for file', file.id, err);
    return { id: file.id, filename: '' };
  }
}

/** Convenience helper – returns array of {id, filename} for every file */
async function listAllFilesWithNames(): Promise<{ id: string; filename: string }[]> {
  const raw = await listAllVectorStoreFiles();
  // Parallel retrieval (but cap concurrency to avoid rate limits)
  const concurrency = 5;
  const results: { id: string; filename: string }[] = [];
  for (let i = 0; i < raw.length; i += concurrency) {
    const slice = raw.slice(i, i + concurrency);
    const detailed = await Promise.all(slice.map(ensureFilename));
    results.push(...detailed);
  }
  return results;
}

// Exported for debug utilities only – not part of public API
export { listAllFilesWithNames };

/**
 * Upload a markdown file to the OpenAI vector store
 * @param fileContent - The file content as string
 * @param fileName - Name for the file in the vector store
 * @returns Promise<VectorStoreFile>
 */
export async function uploadFileToVectorStore(
  fileContent: string,
  fileName: string
) {
  try {
    console.log(`📤 Uploading ${fileName} to vector store...`);
    
    // Convert string content to Buffer for upload
    const buffer = Buffer.from(fileContent, 'utf8');

    // Ensure .md extension for the File object
    const uploadFileName = fileName.replace('.mdoc', '.md');
    const file = new File([buffer], uploadFileName, { type: 'text/markdown' });

    // Step 1 – upload raw file to /files endpoint
    const fileInfo = await openai.files.create({ file, purpose: 'assistants' } as any);

    // Step 2 – attach file to vector store and set attributes so we can later query by filename
    const vectorStoreFile = await openai.vectorStores.files.create(
      VECTOR_STORE_ID,
      {
        file_id: fileInfo.id,
        attributes: {
          filename: uploadFileName,
        },
      } as any
    );

    console.log(`✅ Successfully uploaded ${fileName} to vector store (file_id=${fileInfo.id})`);
    return vectorStoreFile;
    
  } catch (error) {
    console.error(`❌ Error uploading ${fileName}:`, error);
    throw error;
  }
}

/**
 * Check if a file already exists in the vector store
 * @param fileName - Name of the file to check
 * @returns Promise<string | null> - File ID if exists, null if not
 */
export async function findExistingFile(fileName: string): Promise<string | null> {
  try {
    const files = await listAllFilesWithNames();
    for (const f of files) {
      if (f.filename === fileName) {
        return f.id;
      }
    }

    return null;
  } catch (error) {
    console.error('Error checking existing files:', error);
    return null;
  }
}

/**
 * Delete a file from the vector store
 * @param fileId - ID of the file to delete
 */
export async function deleteFileFromVectorStore(fileId: string) {
  try {
    // 1. Retrieve the vector-store file to learn its underlying upload id
    let rawId: string | undefined;
    try {
      const info: any = await openai.vectorStores.files.retrieve(
        VECTOR_STORE_ID,
        fileId
      );
      rawId = info?.file_id as string | undefined;
    } catch (e) {
      // If retrieve fails we still attempt the pointer deletion below
      console.warn(`⚠️ Could not retrieve vector file ${fileId}:`, e);
    }

    // 2. Delete the vector-store pointer
    await openai.vectorStores.files.del(VECTOR_STORE_ID, fileId);
    console.log(`🗑️ Deleted vector-store file ${fileId}`);

    // 3. Delete the raw file (best-effort)
    if (rawId) {
      try {
        await openai.files.del(rawId);
        console.log(`🗑️ Deleted raw file ${rawId}`);
      } catch (e) {
        console.warn(`⚠️ Failed to delete raw file ${rawId}:`, e);
      }
    }

    return true;
  } catch (error) {
    console.error(`❌ Error deleting vector-store file ${fileId}:`, error);
    return false;
  }
}

/**
 * Sync a timeline file to the vector store (handles updates)
 * @param fileContent - The file content as string
 * @param fileName - Name for the file in the vector store
 */
export async function syncTimelineFile(fileContent: string, fileName: string) {
  // Normalize filename: always use .md extension
  const normalizedName = fileName.endsWith('.mdoc') ? fileName.replace('.mdoc', '.md') : fileName;
  try {
    // Check if file already exists (using normalized name)
    const existingFileId = await findExistingFile(normalizedName);
    if (existingFileId) {
      console.log(`🔄 File ${normalizedName} exists, replacing...`);
      await deleteFileFromVectorStore(existingFileId);
    }
    // Upload using normalized name
    await uploadFileToVectorStore(fileContent, normalizedName);
  } catch (error) {
    console.error(`❌ Error syncing ${normalizedName}:`, error);
    throw error;
  }
}

/**
 * Sync a timeline entry (by logical base name).
 * Creates filename  <base>-body-<hash>.md
 * Deletes any older versions whose prefix matches <base>-body- and whose hash differs.
 */
export async function syncTimelineEntry(baseName: string, fileContent: string) {
  const hash = sha256(fileContent);
  const vectorName = `${baseName}-body-${hash}.md`;
  console.log(`📝 Syncing ${baseName} → ${vectorName}`);

  // 1. First list – gather ids
  const staleIds: string[] = [];
  let upToDateId: string | null = null;
  try {
    const files = await listAllFilesWithNames();
    for (const f of files) {
      const fname = f.filename || '';
      if (!fname.startsWith(`${baseName}-body-`)) continue;
      if (fname === vectorName) {
        upToDateId = f.id;
      } else {
        staleIds.push(f.id);
      }
    }
  } catch (e) {
    console.error('⚠️ Failed initial list:', e);
  }

  // 2. Upload if needed
  if (!upToDateId) {
    const uploaded = await uploadFileToVectorStore(fileContent, vectorName);
    upToDateId = uploaded.id;
  } else {
    console.log('✔️ Latest version already present');
  }

  // 3. Delete stale
  const results = await Promise.allSettled(staleIds.map(id => deleteFileFromVectorStore(id)));
  console.log('🧹 Final cleanup results:', results);

  // 4. Extra safety: remove any *anonymous* files (missing filename) – these are
  // legacy uploads created before we started setting attributes.filename. They
  // can never be matched again, so purge them to keep the store lean.
  try {
    const currentFiles = await listAllFilesWithNames();
    const anonymous = currentFiles.filter(f => !f.filename);
    if (anonymous.length) {
      console.log(`🧹 Deleting ${anonymous.length} legacy nameless files...`);
      await Promise.allSettled(anonymous.map(f => deleteFileFromVectorStore(f.id)));
    }
  } catch (err) {
    console.error('⚠️ Error during anonymous file cleanup:', err);
  }
}

/**
 * Get file content from GitHub API (for webhook processing)
 * @param filePath - Path to the file in the repository
 * @param commitSha - Commit SHA for the file version
 * @param isBinary - Whether the file is binary (for images)
 * @returns Promise<string> - File content (base64 for binary, text for text)
 */
export async function getFileContentFromGitHub(
  filePath: string,
  commitSha: string,
  isBinary: boolean = false
): Promise<string> {
  try {
    console.log('🔍 Downloading file from GitHub:', filePath);
    console.log('🔍 Is binary file:', isBinary);
    console.log('🔍 Commit SHA:', commitSha);
    
    // URL encode the file path to handle spaces
    const encodedPath = encodeURIComponent(filePath);
    console.log('🔍 Encoded path:', encodedPath);
    
    const url = `https://api.github.com/repos/starholder11/HH-Bot/contents/${encodedPath}?ref=${commitSha}`;
    console.log('🔍 GitHub API URL:', url);
    
    const response = await fetch(url, {
      headers: {
        'Accept': isBinary ? 'application/vnd.github.v3+json' : 'application/vnd.github.v3.raw',
        'User-Agent': 'HH-Bot-Sync'
      }
    });
    
    if (!response.ok) {
      console.error('❌ GitHub API error:', response.status, response.statusText);
      const errorText = await response.text();
      console.error('❌ Error response:', errorText);
      throw new Error(`GitHub API error: ${response.status} - ${errorText}`);
    }
    
    if (isBinary) {
      // For binary files, get JSON response with base64 content
      const data = await response.json();
      console.log('📊 Downloaded binary file size:', data.size, 'bytes');
      console.log('📋 File type from GitHub:', data.type);
      console.log('📋 Encoding from GitHub:', data.encoding);
      console.log('📊 Base64 content length:', data.content?.length || 0);
      console.log('📊 Download URL available:', !!data.download_url);
      
      // Handle large files (>1MB) that don't have inline content
      if (!data.content && data.download_url) {
        console.log('📥 Large file detected, using download URL...');
        console.log('🔗 Download URL:', data.download_url);
        
        const downloadResponse = await fetch(data.download_url);
        if (!downloadResponse.ok) {
          throw new Error(`Failed to download file: ${downloadResponse.status}`);
        }
        
        const arrayBuffer = await downloadResponse.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        console.log('📊 Downloaded file buffer size:', buffer.length, 'bytes');
        console.log('📊 First 16 bytes (hex):', buffer.slice(0, 16).toString('hex'));
        
        // Convert buffer to base64 for consistency with existing code
        const base64Content = buffer.toString('base64');
        console.log('📊 Converted to base64 length:', base64Content.length);
        
        return base64Content;
      }
      
      // Handle small files with inline base64 content
      if (data.content) {
        console.log('📥 Small file detected, using inline content...');
        
        if (data.encoding !== 'base64') {
          throw new Error(`Unexpected encoding: ${data.encoding}, expected base64`);
        }
        
        return data.content;
      }
      
      throw new Error('No content or download URL available from GitHub API');
    } else {
      // For text files, get raw content
      const content = await response.text();
      console.log('📊 Downloaded text file size:', content.length, 'bytes');
      return content;
    }
  } catch (error) {
    console.error(`❌ Error fetching file content from GitHub:`, error);
    throw error;
  }
}

/**
 * Robustly list *all* raw files in the account. Needed to track orphan uploads that
 * are no longer referenced by any vector-store file.
 */
async function listAllRawFiles(): Promise<any[]> {
  try {
    const pageSize = 100 as const;
    let page: any = await openai.files.list({ limit: pageSize } as any);

    // Prefer the modern iterator helper if present.
    if (typeof page?.iter === 'function') {
      const out: any[] = [];
      for await (const file of (openai.files.list({ limit: pageSize } as any) as any).iter()) {
        out.push(file);
      }
      return out;
    }

    // Fallback to classic pagination using `has_more`.
    const all: any[] = [];
    all.push(...(page.data || []));
    while (page.has_more) {
      const lastId = page.data?.[page.data.length - 1]?.id;
      page = await openai.files.list({ limit: pageSize, after: lastId } as any);
      all.push(...(page.data || []));
    }
    return all;
  } catch (err) {
    console.error('⚠️  Failed to list raw uploads:', err);
    return [];
  }
}

/**
 * Delete *orphan* raw uploads – any file in the /files endpoint whose `id` is not
 * referenced by a vector-store file. Only touches files with `purpose==='assistants'`
 * and whose filename follows our timeline pattern (contains `-body-`).
 * Returns a summary of the deletion results.
 */
export async function nukeOrphanRawUploads() {
  // 1. Gather all referenced raw ids from the vector store
  const vectorFiles = await listAllVectorStoreFiles();
  const referenced = new Set<string>(vectorFiles.map((f: any) => f.file_id).filter(Boolean));

  // 2. List every raw upload in the account
  const rawFiles = await listAllRawFiles();

  // 3. Filter to orphan uploads that look like timeline markdown bodies
  const candidates = rawFiles.filter((f: any) => {
    if (!f || !f.id) return false;
    if (referenced.has(f.id)) return false; // still in use
    if (f.purpose !== 'assistants') return false; // leave other purposes alone
    if (!f.filename || typeof f.filename !== 'string') return false;
    return f.filename.includes('-body-') && f.filename.endsWith('.md');
  });

  console.log(`🧨 Found ${candidates.length} orphan raw uploads to delete...`);
  const results = await Promise.allSettled(
    candidates.map((f: any) => openai.files.del(f.id))
  );

  const summary = results.map((r, idx) => ({
    id: candidates[idx].id,
    filename: candidates[idx].filename,
    status: r.status,
    reason: (r as any).reason?.message || undefined,
  }));

  console.log('🧨 Orphan deletion complete:', summary);
  return { deleted: candidates.length, summary };
}

// Export internal helpers for debugging routes
export { listAllRawFiles };