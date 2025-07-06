/**
 * Individual search index entry
 */
export interface SearchIndexEntry {
  slug: string;           // Timeline entry identifier
  title: string;          // Entry title for display
  url: string;            // Full URL path (/timeline/[slug])
  content: string;        // Processed text content (markdown stripped)
  preview: string;        // First 150 chars for preview
  lastUpdated: string;    // ISO date string for cache busting
}

/**
 * Complete search index structure
 */
export interface SearchIndex {
  entries: SearchIndexEntry[];
  generatedAt: string;    // ISO date string
  version: string;        // Version for cache management
}

/**
 * Search result with relevance score
 */
export interface SearchResult {
  slug: string;
  title: string;
  url: string;
  content: string;
  preview: string;
  score?: number;         // Relevance score from Fuse.js
} 