"use client";
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import * as searchService from '@/app/visual-search/services/searchService';
import VSResultCard from '@/app/visual-search/components/ResultCard/ResultCard';

interface AssetImportModalProps {
  onClose: () => void;
  onSelect: (asset: any) => void;
}

export default function AssetImportModal({ onClose, onSelect }: AssetImportModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<string[]>(['image','video','audio','text']);
  const [mounted, setMounted] = useState(false);
  const controllerRef = React.useRef<AbortController | null>(null);
  const debounceRef = React.useRef<number | null>(null);
  const lastRequestIdRef = React.useRef<number>(0);

  const searchAssets = async (query: string, overrideTypes?: string[]) => {
    const q = query.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      // Abort any in-flight request and start a new one
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      // Track request ordering to prevent stale responses overwriting newer ones
      const requestId = (lastRequestIdRef.current += 1);
      setIsLoading(true);
      try {
        const activeTypes = overrideTypes && overrideTypes.length ? overrideTypes : selectedTypes;
        const typeParam = activeTypes.join(',');
        console.log('[ASSET SEARCH] Query:', q, 'Types:', activeTypes, 'Param:', typeParam);
        const json = await searchService.get(q, { type: typeParam, limit: 50, signal: controller.signal });
        if (controller.signal.aborted || requestId !== lastRequestIdRef.current) return;
        const results = (json as any)?.results || {};
        console.log('[ASSET SEARCH] Raw results:', results);
        // Choose list to show based on active filters
        const onlyText = activeTypes.length === 1 && activeTypes[0] === 'text';
        const onlyMedia = activeTypes.every(t => ['image','video','audio'].includes(t)) && !activeTypes.includes('text');
        const baseList = onlyText ? results.text : onlyMedia ? results.media : (results.all || []);
        console.log('[ASSET SEARCH] Base list:', baseList?.length, 'items from', onlyText ? 'text' : onlyMedia ? 'media' : 'all');
        const allow = new Set<string>(activeTypes.includes('text') && activeTypes.length === 1 ? ['text'] : activeTypes);
        const filtered = (Array.isArray(baseList) ? baseList : []).filter((r: any) => allow.has((r.content_type || r.type || '').toLowerCase()));
        console.log('[ASSET SEARCH] Filtered results:', filtered.length, 'items, first 3 types:', filtered.slice(0, 3).map((r: any) => r.content_type || r.type));
        setSearchResults(filtered);
      } catch (error: any) {
        // Ignore abort errors; they are expected during fast typing
        if (error?.name !== 'AbortError') {
          // eslint-disable-next-line no-console
          console.error('Asset search failed:', error);
          // Do NOT clear existing results on transient errors
        }
      } finally {
        if (requestId === lastRequestIdRef.current) setIsLoading(false);
      }
    }, 200);
  };

    // Ensure portal target exists
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
      <div className="bg-neutral-900 border border-neutral-700 rounded-lg w-[66vw] h-[66vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-neutral-700">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-medium text-neutral-100">Search Assets</h2>
            <div className="flex flex-wrap gap-1">
              {['image','video','audio','text'].map(t => {
                const active = selectedTypes.includes(t);
                return (
                  <button
                    key={t}
                    onClick={() => {
                      setSelectedTypes(prev => {
                        const isCurrentlyActive = prev.includes(t) && prev.length === 1;
                        if (isCurrentlyActive) {
                          // If this is the only active filter, select all types
                          const allTypes = ['image', 'video', 'audio', 'text'];
                          console.log('[ASSET SEARCH] Filter changed to ALL:', allTypes);
                          void searchAssets(searchQuery, allTypes);
                          return allTypes;
                        } else {
                          // Make this the only active filter
                          const next = [t];
                          console.log('[ASSET SEARCH] Filter changed to ONLY:', next);
                          void searchAssets(searchQuery, next);
                          return next;
                        }
                      });
                    }}
                    className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${active ? 'border-blue-500 bg-blue-600 text-white' : 'border-neutral-600 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:border-neutral-500'}`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-neutral-800 rounded text-neutral-400 hover:text-neutral-200"
          >
            ✕
          </button>
        </div>

        {/* Search Input */}
        <div className="p-4 border-b border-neutral-700">
          <input
            type="text"
            placeholder="Search for images, videos, and other media..."
            value={searchQuery}
            onChange={(e) => {
              const v = e.target.value;
              setSearchQuery(v);
              void searchAssets(v);
            }}
            className="w-full px-3 py-2 bg-neutral-800 border border-neutral-600 rounded text-neutral-200 placeholder-neutral-400"
          />
        </div>

        {/* Results */}
        <div className="flex-1 overflow-auto p-4">
          {isLoading && (
            <div className="text-center py-8 text-neutral-400">
              Searching assets...
            </div>
          )}

          {!isLoading && searchResults.length === 0 && (
            <div className="text-center py-8 text-neutral-400">
              {searchQuery ? 'No assets found matching your search.' : 'Start typing to search for assets.'}
            </div>
          )}

          {!isLoading && searchResults.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {searchResults.map((r: any) => (
                  <div key={r.id}>
                    <VSResultCard
                      r={r}
                      onPin={() => {}}
                      onOpen={() => onSelect(r)}
                      hidePin
                    />
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
