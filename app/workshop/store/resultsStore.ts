import { create } from 'zustand';
import type { UnifiedSearchResult } from '../types';

type Filters = { type?: 'all' | 'media' | 'image' | 'video' | 'audio' | 'text' };

type ResultsState = {
  query: string;
  page: number;
  total: number;
  filters: Filters;
  results: UnifiedSearchResult[];
  setQuery: (q: string) => void;
  setPage: (p: number) => void;
  setFilter: (f: Filters) => void;
  setResults: (r: UnifiedSearchResult[], total?: number) => void;
  reset: () => void;
};

export const useResultsStore = create<ResultsState>((set) => ({
  query: '',
  page: 1,
  total: 0,
  filters: { type: 'all' },
  results: [],
  setQuery: (q) => set({ query: q }),
  setPage: (p) => set({ page: p }),
  setFilter: (f) => set({ filters: { ...f } }),
  setResults: (r, total) => set((s) => ({ results: r, total: total ?? s.total })),
  reset: () => set({ query: '', page: 1, total: 0, filters: { type: 'all' }, results: [] }),
}));



