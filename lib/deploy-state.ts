import { Octokit } from '@octokit/rest';

// Initialize GitHub API client
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

interface DeployState {
  isDeployed: boolean;
  deployedCommit: string | null;
  latestCommit: string | null;
  hasChanges: boolean;
}

/**
 * Get the latest commit SHA for the main branch
 */
async function getLatestCommit(): Promise<string | null> {
  try {
    const response = await octokit.rest.repos.getBranch({
      owner: 'starholder11',
      repo: 'HH-Bot',
      branch: 'main',
    });
    
    return response.data.commit.sha;
  } catch (error) {
    console.error('Error getting latest commit:', error);
    return null;
  }
}

/**
 * Get the deployed commit SHA from environment or deployment tracking
 * This could be stored in environment variables, database, or deployment metadata
 */
async function getDeployedCommit(): Promise<string | null> {
  // For now, we'll use an environment variable
  // In production, this could be updated by your deployment process
  const deployedCommit = process.env.DEPLOYED_COMMIT_SHA;
  
  if (deployedCommit) {
    return deployedCommit;
  }
  
  // Fallback: try to get from GitHub deployment API
  try {
    const deployments = await octokit.rest.repos.listDeployments({
      owner: 'starholder11',
      repo: 'HH-Bot',
      environment: 'production',
      per_page: 1,
    });
    
    if (deployments.data.length > 0) {
      return deployments.data[0].sha;
    }
  } catch (error) {
    console.error('Error getting deployment info:', error);
  }
  
  return null;
}

/**
 * Check if a specific file has changed between two commits
 */
async function hasFileChanged(
  filePath: string,
  fromCommit: string,
  toCommit: string
): Promise<boolean> {
  try {
    const response = await octokit.rest.repos.compareCommits({
      owner: 'starholder11',
      repo: 'HH-Bot',
      base: fromCommit,
      head: toCommit,
    });
    
    // Check if the file is in the changed files list
    return response.data.files?.some(file => file.filename === filePath) || false;
  } catch (error) {
    console.error('Error comparing commits:', error);
    return false;
  }
}

/**
 * Get the current deploy state
 */
export async function getDeployState(): Promise<DeployState> {
  const latestCommit = await getLatestCommit();
  const deployedCommit = await getDeployedCommit();
  
  if (!latestCommit) {
    return {
      isDeployed: false,
      deployedCommit: null,
      latestCommit: null,
      hasChanges: false,
    };
  }
  
  if (!deployedCommit) {
    // No deployed commit found, assume everything is new
    return {
      isDeployed: false,
      deployedCommit: null,
      latestCommit,
      hasChanges: true,
    };
  }
  
  const hasChanges = latestCommit !== deployedCommit;
  
  return {
    isDeployed: true,
    deployedCommit,
    latestCommit,
    hasChanges,
  };
}

/**
 * Check if a specific timeline entry has changes
 */
export async function hasTimelineEntryChanged(slug: string): Promise<boolean> {
  const deployState = await getDeployState();
  
  if (!deployState.hasChanges || !deployState.deployedCommit || !deployState.latestCommit) {
    return false;
  }
  
  // Check if the timeline entry folder or its content has changed
  const timelinePath = `content/timeline`;
  
  try {
    // Get all timeline entries and check if any have changed
    const response = await octokit.rest.repos.compareCommits({
      owner: 'starholder11',
      repo: 'HH-Bot',
      base: deployState.deployedCommit,
      head: deployState.latestCommit,
    });
    
    // Check if any timeline-related files have changed
    const timelineFilesChanged = response.data.files?.some(file => 
      file.filename.startsWith(timelinePath)
    ) || false;
    
    return timelineFilesChanged;
  } catch (error) {
    console.error('Error checking timeline changes:', error);
    return false;
  }
}

/**
 * Update the deployed commit SHA (called by deployment process)
 */
export async function updateDeployedCommit(commitSha: string): Promise<void> {
  // In a real implementation, this would update a database or environment variable
  // For now, we'll just log it
  console.log(`Deployed commit updated to: ${commitSha}`);
  
  // You could also create a deployment record in GitHub
  try {
    await octokit.rest.repos.createDeployment({
      owner: 'starholder11',
      repo: 'HH-Bot',
      ref: commitSha,
      environment: 'production',
      description: 'Auto-deployment from Vercel',
    });
  } catch (error) {
    console.error('Error creating deployment record:', error);
  }
} 