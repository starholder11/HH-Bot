import { useCallback, useRef } from 'react';
import { useResultsStore } from '../store/resultsStore';
import * as searchService from '../services/searchService';
import { debug } from '../utils/log';
import { getResultMediaUrl } from '../utils/mediaUrl';

// Simple in-memory cache for search results
const searchCache = new Map<string, { results: any; timestamp: number; total: number }>();
const CACHE_DURATION = 2 * 60 * 1000; // 2 minutes

export function useResults() {
  const controllerRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const { setAllResults, setResults } = useResultsStore();

  const requestIdRef = useRef(0);

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
        const reqId = ++requestIdRef.current;
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

        // Kick off fast and full requests in parallel
        const fastPromise = searchService.get(query, { 
          page: page || 1,
          type, 
          signal: controller.signal,
          fast: true
        });
        const fullPromise = searchService.get(query, { 
          page: page || 1,
          type, 
          signal: controller.signal,
          fast: false
        });

        const json = await fastPromise; // await only fast for quicker first paint

        if (!controller.signal.aborted) {
          const allResults = json.results.all || [];
          const totalResults = json.total_results || 0;

          debug('vs:search', 'got results:', allResults.length);

          // Render first batch immediately (first 12 results)
          const firstBatch = allResults.slice(0, 12);
          // Precompute media URLs to avoid work during render
          const firstBatchWithUrls = firstBatch.map((r: any) => ({ ...r, _url: getResultMediaUrl(r) }));
          setResults(firstBatchWithUrls as any, totalResults);
          setAllResults(allResults, totalResults);

          // Progressive loading of remaining results
          if (allResults.length > 12) {
            // Render remaining results in batches after a short delay
            setTimeout(() => {
              if (!controller.signal.aborted) {
                const b = allResults.slice(0, 50).map((r: any) => ({ ...r, _url: getResultMediaUrl(r) }));
                setResults(b as any, totalResults);
              }
            }, 100);

            setTimeout(() => {
              if (!controller.signal.aborted) {
                const b = allResults.slice(0, 100).map((r: any) => ({ ...r, _url: getResultMediaUrl(r) }));
                setResults(b as any, totalResults);
              }
            }, 300);
          }

          // Cache the results
          searchCache.set(cacheKey, {
            results: allResults,
            timestamp: Date.now(),
            total: totalResults
          });

          // When full request completes, upgrade results seamlessly
          void fullPromise.then((fullJson) => {
            if (controller.signal.aborted || reqId !== requestIdRef.current) return;
            try {
              const fullAll = (fullJson?.results?.all as any[]) || [];
              const total = fullJson?.total_results || fullAll.length;
              const withUrls = fullAll.map((r: any) => ({ ...r, _url: getResultMediaUrl(r) }));
              setAllResults(withUrls as any, total);
              // Keep current page size but upgrade data to full set
              setResults(withUrls.slice(0, 100) as any, total);
              searchCache.set(cacheKey, { results: withUrls as any, timestamp: Date.now(), total });
            } catch (e) {
              debug('vs:search', 'full upgrade failed', (e as any)?.message);
            }
          }).catch(() => undefined);
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



