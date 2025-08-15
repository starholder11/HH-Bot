import type { UnifiedSearchResponse } from '../types';
import { SEARCH_CONSTANTS } from '../constants';

export async function get(query: string, opts?: { limit?: number; page?: number; type?: string; signal?: AbortSignal; fast?: boolean }) {
  if (!query || query.trim().length === 0) throw new Error('Query is required');
  const limit = opts?.limit ?? SEARCH_CONSTANTS.PAGE_SIZE; // Use page size (100) as default instead of 400
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
        content_types: contentTypes,
        fast: opts?.fast === true
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
    // Single type or no type - use GET request, include fast flag via query param
    const typeParam = opts?.type ? `&type=${encodeURIComponent(opts.type)}` : '';
    const fastParam = opts?.fast ? `&fast=1` : '';
    const url = `/api/unified-search?q=${encodeURIComponent(query)}&limit=${limit}&page=${page}${typeParam}${fastParam}`;
    const res = await fetch(url, { method: 'GET', signal: opts?.signal });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Search failed: ${res.status} ${text}`);
    }
    const json: UnifiedSearchResponse = await res.json();
    return json;
  }
}



