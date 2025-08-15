import { useCallback, useRef } from 'react';
import { useResultsStore } from '../store/resultsStore';
import * as searchService from '../services/searchService';
import { debug } from '../utils/log';

export function useResults() {
  const controllerRef = useRef<AbortController | null>(null);
  const { setResults, setPage } = useResultsStore();

  const executeSearch = useCallback(async (query: string, page?: number, type?: string) => {
    try {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const json = await searchService.get(query, { page, type, signal: controller.signal });
      if (!controller.signal.aborted) {
        setResults(json.results.all || [], json.total_results || 0);
        if (typeof json.page === 'number') setPage(json.page);
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        // swallow for now; upstream can set error state if needed
        debug('vs:search', 'error', e.message);
      }
    }
  }, [setResults, setPage]);

  return { executeSearch } as const;
}



