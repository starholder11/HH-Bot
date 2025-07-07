"use client";
import React, { useState, useEffect, useRef } from 'react';
import Fuse from 'fuse.js';
import type { SearchResult } from '../../lib/search/types';
import { SearchInput } from './SearchInput';
import { SearchResults } from './SearchResults';
import { createPortal } from 'react-dom';

// Vercel redeploy: ensure search dropdown width fix is live

const fuseOptions = {
  keys: [
    { name: 'title', weight: 0.7 },
    { name: 'content', weight: 0.3 }
  ],
  threshold: 0.3,
  includeScore: true,
  minMatchCharLength: 2,
  ignoreLocation: true,
};

export interface SearchProps {
  variant?: 'compact' | 'full';
  placeholder?: string;
  maxResults?: number;
  className?: string;
}

export function Search({
  variant = 'compact',
  placeholder = 'Search timeline...',
  maxResults = 5,
  className
}: SearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [indexLoaded, setIndexLoaded] = useState(false);
  const [indexError, setIndexError] = useState<string | null>(null);
  const fuseRef = useRef<Fuse<SearchResult> | null>(null);

  useEffect(() => {
    console.log('🔍 Loading search index...');
    fetch('/api/search-index')
      .then(res => {
        if (!res.ok) throw new Error('Index not found');
        return res.json();
      })
      .then(data => {
        console.log('✅ Search index loaded:', data.entries.length, 'entries');
        fuseRef.current = new Fuse(data.entries, fuseOptions);
        setIndexLoaded(true);
      })
      .catch(error => {
        console.error('❌ Search index failed to load:', error);
        setIndexError('Search temporarily unavailable');
      });
  }, []);

  useEffect(() => {
    if (!indexLoaded || !fuseRef.current || !query.trim()) {
      setResults([]);
      return;
    }
    console.log('🔍 Searching for:', query.trim());
    setLoading(true);
    const fuse = fuseRef.current;
    const fuseResults = fuse.search(query.trim(), { limit: maxResults });
    console.log('📊 Found', fuseResults.length, 'results');
    setResults(fuseResults.map(r => ({ ...r.item, score: r.score })));
    setLoading(false);
  }, [query, indexLoaded, maxResults]);

  // Dropdown open/close for compact variant
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{top: number, left: number, width: number} | null>(null);

  // Auto-open dropdown when there are results or when typing
  useEffect(() => {
    if (variant === 'compact' && (results.length > 0 || query.trim().length > 0)) {
      setOpen(true);
    } else if (variant === 'compact' && results.length === 0 && query.trim().length === 0) {
      setOpen(false);
    }
  }, [results, query, variant]);

  useEffect(() => {
    if (variant === 'compact' && open && inputRef.current) {
      inputRef.current.focus();
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX,
        width: Math.max(320, rect.width)
      });
    } else {
      setDropdownPos(null);
    }
  }, [open, variant]);

  // Close dropdown on click outside or ESC
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent | KeyboardEvent) {
      if (e instanceof KeyboardEvent && e.key === 'Escape') setOpen(false);
      if (e instanceof MouseEvent && inputRef.current && !inputRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    document.addEventListener('keydown', handle);
    return () => {
      document.removeEventListener('mousedown', handle);
      document.removeEventListener('keydown', handle);
    };
  }, [open]);

  const handleInputFocus = () => {
    if (variant === 'compact') {
      setOpen(true);
    }
  };

  return (
    <div className={`${className || ''}`.trim()}>
      {variant === 'compact' ? (
        <>
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={placeholder}
            className="search-input border rounded px-2 py-1 w-48 text-sm"
            debounce={300}
            ref={inputRef}
            onFocus={handleInputFocus}
          />
          {open && dropdownPos && createPortal(
            <div
              className="search-dropdown"
              style={{
                top: dropdownPos.top,
                left: dropdownPos.left,
                width: dropdownPos.width,
              }}
            >
              <SearchResults
                results={results}
                variant={variant}
                loading={loading}
                error={indexError}
                onResultClick={result => {
                  window.location.href = result.url;
                  setOpen(false);
                }}
              />
            </div>,
            document.body
          )}
        </>
      ) : (
        <>
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={placeholder}
            className="border rounded px-4 py-2 w-full text-base"
            debounce={300}
          />
          <div className="mt-4">
            <SearchResults
              results={results}
              variant={variant}
              loading={loading}
              error={indexError}
              onResultClick={result => window.location.href = result.url}
            />
          </div>
        </>
      )}
    </div>
  );
} 