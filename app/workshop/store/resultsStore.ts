import { create } from 'zustand';
import type { UnifiedSearchResult } from '../types';
import { SEARCH_CONSTANTS } from '../constants';

type Filters = { type?: 'all' | 'media' | 'image' | 'video' | 'audio' | 'text' };

type ResultsState = {
  query: string;
  page: number;
  total: number;
  filters: Filters;
  results: UnifiedSearchResult[];
  allResults: UnifiedSearchResult[];  // All fetched results
  setQuery: (q: string) => void;
  setPage: (p: number) => void;
  setFilter: (f: Filters) => void;
  setResults: (r: UnifiedSearchResult[], total?: number) => void;
  setAllResults: (r: UnifiedSearchResult[], total?: number) => void;
  getPaginatedResults: () => UnifiedSearchResult[];
  getTotalPages: () => number;
  reset: () => void;
};

export const useResultsStore = create<ResultsState>((set, get) => ({
  query: '',
  page: 1,
  total: 0,
  filters: { type: 'all' },
  results: [],
  allResults: [],
  setQuery: (q) => set({ query: q, page: 1 }), // Reset to page 1 on new query
  setPage: (p) => set({ page: p }),
  setFilter: (f) => set({ filters: { ...f }, page: 1 }), // Reset to page 1 on filter change
  setResults: (r, total) => set((s) => ({ results: r, total: total ?? s.total })),
  setAllResults: (r, total) => set((s) => ({ allResults: r, total: total ?? s.total })),
  getPaginatedResults: () => {
    const { allResults, page } = get();
    const startIndex = (page - 1) * SEARCH_CONSTANTS.PAGE_SIZE;
    const endIndex = startIndex + SEARCH_CONSTANTS.PAGE_SIZE;
    return allResults.slice(startIndex, endIndex);
  },
  getTotalPages: () => {
    const { allResults } = get();
    return Math.ceil(allResults.length / SEARCH_CONSTANTS.PAGE_SIZE);
  },
  reset: () => set({ query: '', page: 1, total: 0, filters: { type: 'all' }, results: [], allResults: [] }),
}));



