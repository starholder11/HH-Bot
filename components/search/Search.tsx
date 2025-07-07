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
      return;
    }
    setLoading(true);
    const fuse = fuseRef.current;
    const fuseResults = fuse.search(query.trim(), { limit: maxResults });
    setResults(fuseResults.map(r => ({ ...r.item, score: r.score })));
    setLoading(false);
  }, [query, indexLoaded, maxResults]);

  return (
    <div className={`search-wrapper ${className || ''}`}>
      {variant === 'compact' ? (
        <div className="search-compact-container">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={placeholder}
            className="search-input-compact"
            debounce={300}
          />
          {results.length > 0 && (
            <div className="search-dropdown-compact">
              <SearchResults
                results={results}
                variant={variant}
                loading={loading}
                error={indexError}
                onResultClick={result => window.location.href = result.url}
              />
            </div>
          )}
        </div>
      ) : (
        <>
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={placeholder}
            className="search-input-full"
            debounce={300}
          />
          <div className="search-results-full">
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