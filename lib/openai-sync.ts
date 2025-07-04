import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// Use existing vector store ID
const VECTOR_STORE_ID = 'vs_6860128217f08191bacd30e1475d8566';

/**
 * Upload a markdown file to the OpenAI vector store
 * @param filePath - Path to the markdown file
 * @param fileName - Name for the file in the vector store
 * @returns Promise<VectorStoreFile>
 */
export async function uploadFileToVectorStore(
  filePath: string,
  fileName: string
) {
  try {
    console.log(`📤 Uploading ${fileName} to vector store...`);
    
    // Read the file content
    const fileContent = fs.readFileSync(filePath, 'utf8');
    
    // Create a temporary file for upload
    const tempFilePath = path.join('/tmp', fileName);
    fs.writeFileSync(tempFilePath, fileContent);
    
    // Upload to vector store using the researched API method
    const vectorStoreFile = await openai.vectorStores.files.upload(
      VECTOR_STORE_ID,
      fs.createReadStream(tempFilePath)
    );
    
    // Clean up temp file
    fs.unlinkSync(tempFilePath);
    
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
  } catch (error) {
    console.error(`❌ Error deleting file ${fileId}:`, error);
    throw error;
  }
}

/**
 * Sync a timeline file to the vector store (handles updates)
 * @param filePath - Path to the markdown file
 * @param fileName - Name for the file in the vector store
 */
export async function syncTimelineFile(filePath: string, fileName: string) {
  try {
    // Check if file already exists
    const existingFileId = await findExistingFile(fileName);
    
    if (existingFileId) {
      console.log(`🔄 File ${fileName} exists, updating...`);
      // Delete existing file
      await deleteFileFromVectorStore(existingFileId);
    }
    
    // Upload new/updated file
    await uploadFileToVectorStore(filePath, fileName);
    
  } catch (error) {
    console.error(`❌ Error syncing ${fileName}:`, error);
    throw error;
  }
}

/**
 * Get file content from GitHub API (for webhook processing)
 * @param filePath - Path to the file in the repository
 * @param commitSha - Commit SHA for the file version
 * @returns Promise<string> - File content
 */
export async function getFileContentFromGitHub(
  filePath: string,
  commitSha: string
): Promise<string> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/starholder11/HH-Bot/contents/${filePath}?ref=${commitSha}`,
      {
        headers: {
          'Accept': 'application/vnd.github.v3.raw',
          'User-Agent': 'HH-Bot-Sync'
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }
    
    return await response.text();
  } catch (error) {
    console.error(`❌ Error fetching file content from GitHub:`, error);
    throw error;
  }
} 