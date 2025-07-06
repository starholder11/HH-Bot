import { createReader } from '@keystatic/core/reader';
import config from '../../keystatic.config';
import { processContent, generatePreview } from './content-processor';
import type { SearchIndex, SearchIndexEntry } from './types';

/**
 * Generate search index from all timeline entries
 */
export async function generateSearchIndex(): Promise<SearchIndex> {
  try {
    const reader = createReader(process.cwd(), config);
    const entries = await reader.collections.timeline.all();
    
    const searchEntries: SearchIndexEntry[] = entries.map(({ slug, entry }) => ({
      slug,
      title: entry.title || slug,
      url: `/timeline/${slug}`,
      content: processContent(entry.body),
      preview: generatePreview(entry.body, 150),
      lastUpdated: new Date().toISOString()
    }));

    return {
      entries: searchEntries,
      generatedAt: new Date().toISOString(),
      version: '1.0.0'
    };
  } catch (error) {
    console.error('Error generating search index:', error);
    throw error;
  }
}

/**
 * Update the search index file in public directory
 */
export async function updateSearchIndexFile(): Promise<void> {
  try {
    const index = await generateSearchIndex();
    const fs = await import('fs/promises');
    const path = await import('path');
    
    const indexPath = path.join(process.cwd(), 'public', 'search-index.json');
    
    // Ensure public directory exists
    await fs.mkdir(path.dirname(indexPath), { recursive: true });
    
    await fs.writeFile(indexPath, JSON.stringify(index, null, 2));
    console.log(`✅ Search index updated with ${index.entries.length} entries`);
  } catch (error) {
    console.error('❌ Failed to update search index file:', error);
    throw error;
  }
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