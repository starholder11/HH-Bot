import type { UnifiedSearchResponse } from '../types';
import { SEARCH_CONSTANTS } from '../constants';

export async function get(query: string, opts?: { limit?: number; page?: number; type?: string; signal?: AbortSignal }) {
  if (!query || query.trim().length === 0) throw new Error('Query is required');
  const limit = opts?.limit ?? SEARCH_CONSTANTS.DEFAULT_LIMIT;
  const page = opts?.page ?? SEARCH_CONSTANTS.DEFAULT_PAGE;
  
  // Handle multiple content types by converting to POST request with content_types array
  if (opts?.type && opts.type.includes(',')) {
    // Multiple types - use POST request
    const contentTypes = opts.type.split(',').map(t => t.trim()).filter(Boolean);
    const res = await fetch('/api/unified-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        limit,
        page,
        content_types: contentTypes
      }),
      signal: opts?.signal
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Search failed: ${res.status} ${text}`);
    }
    const json: UnifiedSearchResponse = await res.json();
    return json;
  } else {
    // Single type or no type - use GET request
    const typeParam = opts?.type ? `&type=${encodeURIComponent(opts.type)}` : '';
    const url = `/api/unified-search?q=${encodeURIComponent(query)}&limit=${limit}&page=${page}${typeParam}`;
    const res = await fetch(url, { method: 'GET', signal: opts?.signal });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Search failed: ${res.status} ${text}`);
    }
    const json: UnifiedSearchResponse = await res.json();
    return json;
  }
}



