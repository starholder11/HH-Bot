import { Octokit } from '@octokit/rest';
import { toSlug } from './slug-utils';
import type { TimelineEntry } from './content-reader';

// Initialize GitHub API client
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

interface ContentResponse {
  content: string;
  metadata: string;
  title: string;
  date: string;
  slug: string;
}

/**
 * Find the folder name that matches a given slug by checking GitHub API
 */
async function findFolderBySlug(slug: string): Promise<string | null> {
  try {
    // Get the contents of the timeline directory
    const response = await octokit.rest.repos.getContent({
      owner: 'starholder11',
      repo: 'HH-Bot',
      path: 'content/timeline',
    });
    
    if (!Array.isArray(response.data)) {
      return null;
    }
    
    // Look for directories that match the slug
    for (const item of response.data) {
      if (item.type === 'dir') {
        const itemSlug = toSlug(item.name);
        if (itemSlug === slug) {
          return item.name;
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error finding folder by slug:', error);
    return null;
  }
}

/**
 * Get file content from GitHub API
 */
async function getFileContent(path: string, ref?: string): Promise<string | null> {
  try {
    const response = await octokit.rest.repos.getContent({
      owner: 'starholder11',
      repo: 'HH-Bot',
      path,
      ref,
    });
    
    if ('content' in response.data) {
      // Decode base64 content
      return Buffer.from(response.data.content, 'base64').toString('utf-8');
    }
    
    return null;
  } catch (error) {
    console.error(`Error getting file content for ${path}:`, error);
    return null;
  }
}

/**
 * Get timeline entry directly from GitHub API
 */
export async function getTimelineEntryFromGit(
  slug: string,
  ref?: string
): Promise<TimelineEntry | null> {
  try {
    const folderName = await findFolderBySlug(slug);
    if (!folderName) {
      return null;
    }

    const folderPath = `content/timeline/${folderName}`;
    
    // Try to get the body.mdoc file
    let content = '';
    const bodyPath = `${folderPath}/body.mdoc`;
    
    content = await getFileContent(bodyPath, ref) || '';
    
    // If not found in root, try subdirectories
    if (!content) {
      try {
        const folderContents = await octokit.rest.repos.getContent({
          owner: 'starholder11',
          repo: 'HH-Bot',
          path: folderPath,
          ref,
        });
        
        if (Array.isArray(folderContents.data)) {
          for (const item of folderContents.data) {
            if (item.type === 'dir') {
              const subBodyPath = `${folderPath}/${item.name}/body.mdoc`;
              content = await getFileContent(subBodyPath, ref) || '';
              if (content) break;
            }
          }
        }
      } catch (error) {
        console.error('Error checking subdirectories:', error);
      }
    }

    // Get metadata from YAML file
    let metadata: Record<string, any> = {};
    const yamlPath = `${folderPath}/${folderName}.yaml`;
    
    const yamlContent = await getFileContent(yamlPath, ref);
    if (yamlContent) {
      // Simple YAML parsing for basic metadata
      const lines = yamlContent.split('\n');
      for (const line of lines) {
        const match = line.match(/^(\w+):\s*(.+)$/);
        if (match) {
          metadata[match[1]] = match[2].trim();
        }
      }
    }

    return {
      slug,
      title: folderName,
      date: metadata.date || new Date().toISOString(),
      content,
      metadata,
    };
  } catch (error) {
    console.error('Error getting timeline entry from Git:', error);
    return null;
  }
}

/**
 * Get all timeline entry slugs from GitHub API
 */
export async function getAllTimelineSlugsFromGit(ref?: string): Promise<string[]> {
  try {
    const response = await octokit.rest.repos.getContent({
      owner: 'starholder11',
      repo: 'HH-Bot',
      path: 'content/timeline',
      ref,
    });
    
    if (!Array.isArray(response.data)) {
      return [];
    }
    
    return response.data
      .filter(item => item.type === 'dir')
      .map(item => toSlug(item.name))
      .filter(slug => slug.length > 0);
  } catch (error) {
    console.error('Error getting timeline slugs from Git:', error);
    return [];
  }
}

/**
 * Get all timeline entries from GitHub API
 */
export async function getAllTimelineEntriesFromGit(ref?: string): Promise<TimelineEntry[]> {
  const slugs = await getAllTimelineSlugsFromGit(ref);
  const entries: TimelineEntry[] = [];
  
  for (const slug of slugs) {
    const entry = await getTimelineEntryFromGit(slug, ref);
    if (entry) {
      entries.push(entry);
    }
  }
  
  return entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/**
 * Check if a timeline entry exists in Git
 */
export async function timelineEntryExists(slug: string, ref?: string): Promise<boolean> {
  const folderName = await findFolderBySlug(slug);
  return folderName !== null;
}

/**
 * Read content directly from GitHub for preview rendering
 */
export async function readContentFromGit(slug: string): Promise<ContentResponse> {
  try {
    console.log(`📖 Reading content from Git for slug: ${slug}`);
    
    // Read .mdoc file (content)
    const contentResponse = await octokit.rest.repos.getContent({
      owner: 'starholder11',
      repo: 'HH-Bot',
      path: `content/timeline/${slug}/body.mdoc`,
    });

    // Read .yaml file (metadata)
    const metadataResponse = await octokit.rest.repos.getContent({
      owner: 'starholder11',
      repo: 'HH-Bot',
      path: `content/timeline/${slug}.yaml`,
    });

    // Validate responses
    if (Array.isArray(contentResponse.data) || Array.isArray(metadataResponse.data)) {
      throw new Error('Expected file, got directory');
    }

    // Decode content
    const content = Buffer.from((contentResponse.data as any).content, 'base64').toString('utf-8');
    const metadata = Buffer.from((metadataResponse.data as any).content, 'base64').toString('utf-8');

    // Parse YAML metadata
    const parsedMetadata = parseYamlMetadata(metadata);
    
    console.log(`✅ Successfully read content for ${slug}`);
    
    return {
      content,
      metadata,
      title: parsedMetadata.title || slug,
      date: parsedMetadata.date || '',
      slug
    };
  } catch (error) {
    console.error(`❌ Error reading content from Git for ${slug}:`, error);
    throw new Error(`Failed to read content for ${slug}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Parse YAML metadata from string
 */
function parseYamlMetadata(yamlString: string): Record<string, any> {
  try {
    // Simple YAML parser for basic key-value pairs
    const lines = yamlString.split('\n');
    const metadata: Record<string, any> = {};
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const colonIndex = trimmed.indexOf(':');
        if (colonIndex > 0) {
          const key = trimmed.substring(0, colonIndex).trim();
          const value = trimmed.substring(colonIndex + 1).trim();
          
          // Remove quotes if present
          const cleanValue = value.replace(/^["']|["']$/g, '');
          metadata[key] = cleanValue;
        }
      }
    }
    
    return metadata;
  } catch (error) {
    console.error('Error parsing YAML metadata:', error);
    return {};
  }
}

/**
 * Check if content exists in Git
 */
export async function contentExistsInGit(slug: string): Promise<boolean> {
  try {
    await octokit.rest.repos.getContent({
      owner: 'starholder11',
      repo: 'HH-Bot',
      path: `content/timeline/${slug}/body.mdoc`,
    });
    return true;
  } catch (error) {
    return false;
  }
} 