import { Octokit } from '@octokit/rest';
import yaml from 'js-yaml';

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

const REPO_OWNER = 'starholder11';
const REPO_NAME = 'HH-Bot';

interface YAMLUpdateData {
  openaiFileId: string;
  openaiFileName: string;
  lastSyncedAt: string;
  contentHash: string;
}

/**
 * Update YAML file with OpenAI sync metadata
 */
export async function updateEntryYAML(slug: string, updateData: YAMLUpdateData): Promise<void> {
  const yamlPath = `content/timeline/${slug}/${slug}.yaml`;
  
  console.log(`📝 Updating YAML for ${slug}`);
  
  try {
    // Get current YAML file
    const { data: fileData } = await octokit.rest.repos.getContent({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      path: yamlPath,
    });
    
    if (!('content' in fileData)) {
      throw new Error(`File not found: ${yamlPath}`);
    }
    
    // Decode and parse current YAML
    const currentContent = Buffer.from(fileData.content, 'base64').toString('utf-8');
    const currentData = yaml.load(currentContent) as Record<string, any>;
    
    // Merge with update data
    const updatedData = {
      ...currentData,
      ...updateData
    };
    
    // Convert back to YAML
    const updatedContent = yaml.dump(updatedData, {
      indent: 2,
      lineWidth: -1,
      noRefs: true
    });
    
    // Update file in GitHub
    await octokit.rest.repos.createOrUpdateFileContents({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      path: yamlPath,
      message: `Auto-update: Sync OpenAI metadata for ${slug}`,
      content: Buffer.from(updatedContent).toString('base64'),
      sha: fileData.sha,
    });
    
    console.log(`✅ Updated YAML for ${slug}`);
    
  } catch (error: any) {
    console.error(`❌ Failed to update YAML for ${slug}:`, error);
    throw error;
  }
}

/**
 * Batch update multiple YAML files
 */
export async function batchUpdateYAMLFiles(updates: Array<{ slug: string; data: YAMLUpdateData }>): Promise<void> {
  console.log(`📝 Batch updating ${updates.length} YAML files`);
  
  for (const { slug, data } of updates) {
    try {
      await updateEntryYAML(slug, data);
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
      
    } catch (error: any) {
      console.error(`Failed to update ${slug}, continuing with others...`);
      // Continue with other updates even if one fails
    }
  }
  
  console.log('📝 Batch YAML update completed');
} 