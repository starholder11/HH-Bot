import type { UnifiedSearchResponse } from '../types';
import { SEARCH_CONSTANTS } from '../constants';

export async function get(query: string, opts?: { limit?: number; page?: number; type?: string; signal?: AbortSignal }) {
  if (!query || query.trim().length === 0) throw new Error('Query is required');
  const limit = opts?.limit ?? SEARCH_CONSTANTS.DEFAULT_LIMIT;
  const page = opts?.page ?? SEARCH_CONSTANTS.DEFAULT_PAGE;
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



