import { Octokit } from '@octokit/rest';

// Initialize GitHub API client
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

interface UpdateFileOptions {
  filePath: string;
  newContent: string;
  commitMessage: string;
  branch?: string;
  ref?: string; // Add ref parameter for commit SHA
}

/**
 * Update a file in GitHub repository with new content
 */
export async function updateFileInGitHub(options: UpdateFileOptions): Promise<void> {
  const {
    filePath,
    newContent,
    commitMessage,
    branch = 'main',
    ref
  } = options;

  try {
    // Get current file to get its SHA (required for updates)
    const currentFile = await octokit.rest.repos.getContent({
      owner: 'starholder11',
      repo: 'HH-Bot',
      path: filePath,
      ref: ref || branch, // Use commit SHA if provided, otherwise use branch
    });

    // Handle the response which can be an array or single file
    const fileData = Array.isArray(currentFile.data) ? currentFile.data[0] : currentFile.data;
    
    if (!fileData || !('sha' in fileData)) {
      throw new Error('File not found or invalid response');
    }

    // Update file with new content
    await octokit.rest.repos.createOrUpdateFileContents({
      owner: 'starholder11',
      repo: 'HH-Bot',
      path: filePath,
      message: commitMessage,
      content: Buffer.from(newContent).toString('base64'),
      sha: fileData.sha, // Required for updates
      branch: branch,
      committer: {
        name: 'HH-Bot Automation',
        email: 'automation@hh-bot.com'
      },
      author: {
        name: 'HH-Bot Automation',
        email: 'automation@hh-bot.com'
      }
    });

    console.log(`✅ Updated file ${filePath} in GitHub`);
  } catch (error) {
    console.error(`❌ Failed to update file ${filePath}:`, error);
    throw error;
  }
}

/**
 * Replace local image references with S3 URLs in markdown content
 */
export function replaceImageReferences(
  content: string,
  urlMappings: Record<string, string>
): string {
  let updatedContent = content;

  for (const [localFileName, s3Url] of Object.entries(urlMappings)) {
    // Replace various markdown image syntax patterns
    const patterns = [
      // Standard markdown: ![alt](filename.jpg)
      new RegExp(`!\\[([^\\]]*)\\]\\(${localFileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`, 'g'),
      // HTML img tag: <img src="filename.jpg" alt="alt">
      new RegExp(`<img[^>]*src=["']${localFileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>`, 'g'),
    ];

    patterns.forEach(pattern => {
      updatedContent = updatedContent.replace(pattern, (match, altText) => {
        if (match.includes('<img')) {
          // Replace HTML img tag
          return match.replace(
            new RegExp(`src=["']${localFileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`),
            `src="${s3Url}"`
          );
        } else {
          // Replace markdown image
          return `![${altText || ''}](${s3Url})`;
        }
      });
    });
  }

  return updatedContent;
}

/**
 * Get file content from GitHub as string
 */
export async function getFileContentAsString(filePath: string, ref?: string): Promise<string> {
  try {
    const response = await octokit.rest.repos.getContent({
      owner: 'starholder11',
      repo: 'HH-Bot',
      path: filePath,
      ref: ref || 'main',
    });

    if ('content' in response.data) {
      // Decode base64 content
      return Buffer.from(response.data.content, 'base64').toString('utf-8');
    } else {
      throw new Error('File content not found');
    }
  } catch (error) {
    console.error(`❌ Failed to get file content for ${filePath}:`, error);
    throw error;
  }
} 