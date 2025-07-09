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
    
    // Change .mdoc to .md for OpenAI compatibility
    const uploadFileName = fileName.replace('.mdoc', '.md');
    const file = new File([buffer], uploadFileName, { type: 'text/markdown' });
    
    // Upload to vector store using the researched API method
    const vectorStoreFile = await openai.vectorStores.files.upload(
      VECTOR_STORE_ID,
      file
    );
    
    console.log(`✅ Successfully uploaded ${fileName} to vector store`);
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
    const files = await openai.vectorStores.files.list(VECTOR_STORE_ID);
    
    for await (const file of files) {
      if (file.attributes?.filename === fileName) {
        return file.id;
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
    await openai.vectorStores.files.del(VECTOR_STORE_ID, fileId);
    console.log(`🗑️ Deleted file ${fileId} from vector store`);
    return true;
  } catch (error) {
    console.error(`❌ Error deleting file ${fileId}:`, error);
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

  // First list existing files once to see whether current hash is already there
  let newFileId: string | null = null;
  try {
    const files = await openai.vectorStores.files.list(VECTOR_STORE_ID);
    for await (const file of files) {
      const fname = file.attributes?.filename as string | undefined;
      if (!fname) continue;
      if (fname === vectorName) {
        newFileId = file.id; // up-to-date version already exists
      }
    }
  } catch (e) {
    console.error('⚠️ Failed to list vector store files:', e);
  }

  // Upload only if we didn’t find an identical version already
  if (!newFileId) {
    const uploaded = await uploadFileToVectorStore(fileContent, vectorName).catch((err) => {
      console.error('❌ Upload failed:', err);
      throw err;
    });
    newFileId = uploaded.id;
  } else {
    console.log('✔️ Latest version already present, will just clean up old ones');
  }

  // Re-list and delete every older version whose prefix matches but id differs
  try {
    const again = await openai.vectorStores.files.list(VECTOR_STORE_ID);
    const deletions: Promise<boolean>[] = [];
    for await (const file of again) {
      const fname = file.attributes?.filename as string | undefined;
      if (!fname) continue;
      if (fname.startsWith(`${baseName}-body-`) && file.id !== newFileId) {
        console.log(`🗑️ Removing stale ${fname}`);
        deletions.push(deleteFileFromVectorStore(file.id));
      }
    }
    const results = await Promise.allSettled(deletions);
    console.log(`🧹 Cleanup results:`, results);
  } catch (e) {
    console.error('⚠️ Cleanup pass failed:', e);
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