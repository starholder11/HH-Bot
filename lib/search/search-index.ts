import { processContent, generatePreview } from './content-processor';
import type { SearchIndex, SearchIndexEntry } from './types';
import { toSlug } from '../slug-utils';

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
  
  const entries = [];
  for (const dir of dirs) {
    const slug = dir.name; // Directory name is already in slug-case
    const yamlPath = `content/timeline/${slug}/${slug}.yaml`;
    
    // Try to fetch the title from the YAML file
    let title = slug; // Fallback to slug
    try {
      const yamlContent = await fetchFileContentFromGitHub(yamlPath);
      if (yamlContent) {
        // Parse YAML to extract title
        const titleMatch = yamlContent.match(/^title:\s*(.+)$/m);
        if (titleMatch) {
          title = titleMatch[1].trim().replace(/^['"]|['"]$/g, ''); // Remove quotes
        }
      }
    } catch (error) {
      console.warn(`[search-index] Could not fetch title for ${slug}, using slug as title`);
    }
    
    entries.push({
      slug,
      title,
      bodyPath: `content/timeline/${slug}/body.mdoc`,
    });
  }
  
  return entries;
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
        url: `/timeline/${entry.slug}`, // Use slug directly, it's already in slug-case
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