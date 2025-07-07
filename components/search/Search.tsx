"use client";
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Fuse from 'fuse.js';
import type { SearchResult } from '../../lib/search/types';
import { SearchInput } from './SearchInput';
import { SearchResults } from './SearchResults';

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
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fuseRef = useRef<Fuse<SearchResult> | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    fetch('/api/search-index')
      .then(res => {
        if (!res.ok) throw new Error('Index not found');
        return res.json();
      })
      .then(data => {
        fuseRef.current = new Fuse(data.entries, fuseOptions);
        setIndexLoaded(true);
      })
      .catch(error => {
        setIndexError('Search temporarily unavailable');
      });
  }, []);

  useEffect(() => {
    if (!indexLoaded || !fuseRef.current || !query.trim()) {
      setResults([]);
      setIsOpen(false);
      return;
    }
    setLoading(true);
    const fuse = fuseRef.current;
    const fuseResults = fuse.search(query.trim(), { limit: maxResults });
    setResults(fuseResults.map(r => ({ ...r.item, score: r.score })));
    setIsOpen(fuseResults.length > 0);
    setLoading(false);
  }, [query, indexLoaded, maxResults]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    if (value.trim().length > 0) {
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  // Calculate position for portal dropdown
  const getDropdownStyle = () => {
    if (!inputRef.current) return {};
    
    const rect = inputRef.current.getBoundingClientRect();
    return {
      position: 'fixed' as const,
      top: rect.bottom + 4,
      left: rect.left,
      width: '320px', // Fixed readable width
      zIndex: 9999,
    };
  };

  return (
    <>
      {variant === 'compact' ? (
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          placeholder={placeholder}
          className="w-48 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      ) : (
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder={placeholder}
          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          debounce={300}
        />
      )}
      
      {/* Portal the dropdown to document.body */}
      {mounted && isOpen && results.length > 0 && variant === 'compact' && createPortal(
        <div
          style={getDropdownStyle()}
          className="bg-white border border-gray-200 rounded-md shadow-lg max-h-80 overflow-y-auto"
        >
          <SearchResults
            results={results}
            variant={variant}
            loading={loading}
            error={indexError}
            onResultClick={() => setIsOpen(false)}
          />
        </div>,
        document.body
      )}

      {/* Full variant results */}
      {variant === 'full' && (
        <div className="mt-4">
          <SearchResults
            results={results}
            variant={variant}
            loading={loading}
            error={indexError}
            onResultClick={() => {}}
          />
        </div>
      )}
    </>
  );
} 