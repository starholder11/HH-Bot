"use client";
import React, { useState, useEffect, useRef } from 'react';
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
  const fuseRef = useRef<Fuse<SearchResult> | null>(null);

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

  const handleInputChange = (value: string) => {
    setQuery(value);
    if (value.trim().length > 0) {
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  return (
    <div className="relative">
      {variant === 'compact' ? (
        <>
          <input
            type="text"
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder={placeholder}
            className="w-48 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          
          {isOpen && results.length > 0 && (
            <div 
              className="absolute left-0 top-full mt-1 z-[60] bg-white border border-gray-200 rounded-md shadow-lg overflow-hidden"
              style={{ 
                width: '320px',
                maxHeight: '320px'
              }}
            >
              <div className="overflow-y-auto max-h-80">
                <SearchResults
                  results={results}
                  variant={variant}
                  loading={loading}
                  error={indexError}
                  onResultClick={() => setIsOpen(false)}
                />
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={placeholder}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            debounce={300}
          />
          <div className="mt-4">
            <SearchResults
              results={results}
              variant={variant}
              loading={loading}
              error={indexError}
              onResultClick={() => {}}
            />
          </div>
        </>
      )}
    </div>
  );
} 