import { processContent, generatePreview } from './content-processor';
import type { SearchIndex, SearchIndexEntry } from './types';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO || 'HH-Bot';
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'starholder11';
const GITHUB_REF = process.env.GITHUB_REF || 'main';

async function fetchTimelineEntriesFromGitHub(): Promise<{slug: string, title: string, bodyPath: string}[]> {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/content/timeline?ref=${GITHUB_REF}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });
  if (!res.ok) {
    console.error(`[search-index] Failed to list timeline entries: ${res.status} ${res.statusText} - ${url}`);
    return [];
  }
  const data = await res.json();
  const dirs = data.filter((item: any) => item.type === 'dir');
  return dirs.map((dir: any) => ({
    slug: dir.name,
    title: dir.name,
    bodyPath: `content/timeline/${dir.name}/body.mdoc`,
  }));
}

async function fetchFileContentFromGitHub(path: string): Promise<string> {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(path)}?ref=${GITHUB_REF}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.v3.raw',
    },
  });
  if (!res.ok) {
    console.error(`[search-index] Failed to fetch file: ${path} - ${res.status} ${res.statusText} - ${url}`);
    return '';
  }
  return await res.text();
}

/**
 * Generate search index from all timeline entries
 */
export async function generateSearchIndex(): Promise<SearchIndex> {
  const entries: SearchIndexEntry[] = [];
  try {
    const timelineDirs = await fetchTimelineEntriesFromGitHub();
    for (const entry of timelineDirs) {
      const body = await fetchFileContentFromGitHub(entry.bodyPath);
      if (!body) {
        console.warn(`[search-index] Empty body for ${entry.slug} (${entry.bodyPath})`);
      }
      const content = processContent(body);
      entries.push({
        slug: entry.slug,
        title: entry.title,
        url: `/timeline/${entry.slug}`,
        content,
        preview: generatePreview(content, 150),
        lastUpdated: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error('Error generating search index from GitHub:', error);
  }
  return {
    entries,
    generatedAt: new Date().toISOString(),
    version: '1.0.0',
  };
}

/**
 * Update the search index file in public directory
 */
export async function updateSearchIndexFile(): Promise<void> {
  const index = await generateSearchIndex();
  const fs = await import('fs/promises');
  const path = await import('path');
  // In serverless (Vercel), only /tmp is writable at runtime
  const indexPath = path.join('/tmp', 'search-index.json');
  await fs.mkdir(path.dirname(indexPath), { recursive: true });
  await fs.writeFile(indexPath, JSON.stringify(index, null, 2));
  console.log(`✅ Search index updated with ${index.entries.length} entries at ${indexPath}`);
}

/**
 * Load search index from file (for client-side use)
 */
export async function loadSearchIndex(): Promise<SearchIndex | null> {
  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    const indexPath = path.join(process.cwd(), 'public', 'search-index.json');
    const content = await fs.readFile(indexPath, 'utf-8');
    
    return JSON.parse(content) as SearchIndex;
  } catch (error) {
    console.error('Failed to load search index:', error);
    return null;
  }
} 