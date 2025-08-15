import { useCallback, useRef } from 'react';
import { useResultsStore } from '../store/resultsStore';
import * as searchService from '../services/searchService';
import { debug } from '../utils/log';

// Simple in-memory cache for search results
const searchCache = new Map<string, { results: any; timestamp: number; total: number }>();
const CACHE_DURATION = 2 * 60 * 1000; // 2 minutes

export function useResults() {
  const controllerRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const { setAllResults, setResults } = useResultsStore();

  const executeSearch = useCallback(async (query: string, page?: number, type?: string, immediate = false) => {
    // Clear existing debounce timer
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    const performSearch = async () => {
      try {
        controllerRef.current?.abort();
        const controller = new AbortController();
        controllerRef.current = controller;

        // Create cache key from query params
        const cacheKey = `${query}-${page || 1}-${type || 'all'}`;

        // Check cache first
        const cached = searchCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
          debug('vs:search', 'using cached results for:', query);
          setAllResults(cached.results, cached.total);
          setResults(cached.results.slice(0, 100), cached.total);
          return;
        }

        debug('vs:search', 'executing search:', query, 'page:', page, 'type:', type);

        // Set loading state and show first batch immediately
        setResults([], 0);
        setAllResults([], 0);

        const json = await searchService.get(query, { 
          page: page || 1,
          type, 
          signal: controller.signal,
          fast: true // ask server for a quicker initial pool
        });

        if (!controller.signal.aborted) {
          const allResults = json.results.all || [];
          const totalResults = json.total_results || 0;

          debug('vs:search', 'got results:', allResults.length);

          // Render first batch immediately (first 12 results)
          const firstBatch = allResults.slice(0, 12);
          setResults(firstBatch, totalResults);
          setAllResults(allResults, totalResults);

          // Progressive loading of remaining results
          if (allResults.length > 12) {
            // Render remaining results in batches after a short delay
            setTimeout(() => {
              if (!controller.signal.aborted) {
                setResults(allResults.slice(0, 50), totalResults);
              }
            }, 100);

            setTimeout(() => {
              if (!controller.signal.aborted) {
                setResults(allResults.slice(0, 100), totalResults);
              }
            }, 300);
          }

          // Cache the results
          searchCache.set(cacheKey, {
            results: allResults,
            timestamp: Date.now(),
            total: totalResults
          });
        }
      } catch (e: any) {
        if (e.name !== 'AbortError') {
          debug('vs:search', 'error', e.message);
        }
      }
    };

    if (immediate || page !== undefined) {
      // Execute immediately for pagination or explicit immediate requests
      await performSearch();
    } else {
      // Debounce for new searches
      debounceRef.current = setTimeout(performSearch, 500);
    }
  }, [setAllResults, setResults]);

  return { executeSearch } as const;
}



