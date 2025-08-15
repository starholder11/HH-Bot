import { useCallback, useRef } from 'react';
import { useResultsStore } from '../store/resultsStore';
import * as searchService from '../services/searchService';
import { debug } from '../utils/log';

export function useResults() {
  const controllerRef = useRef<AbortController | null>(null);
  const { setAllResults, setResults } = useResultsStore();

  const executeSearch = useCallback(async (query: string, page?: number, type?: string) => {
    try {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      
      debug('vs:search', 'executing search:', query, 'page:', page, 'type:', type);
      
      const json = await searchService.get(query, { 
        page: 1, // Always fetch from page 1 for now
        type, 
        signal: controller.signal 
      });
      
      if (!controller.signal.aborted) {
        const allResults = json.results.all || [];
        debug('vs:search', 'got results:', allResults.length);
        
        // Store all results for pagination
        setAllResults(allResults, json.total_results || 0);
        
        // For backward compatibility, also set the paginated results
        setResults(allResults.slice(0, 100), json.total_results || 0);
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        debug('vs:search', 'error', e.message);
      }
    }
  }, [setAllResults, setResults]);

  return { executeSearch } as const;
}



