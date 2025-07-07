"use client";
import React, { useState, useEffect, useRef, useCallback } from 'react';
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

  // Mount check for portal
  useEffect(() => setMounted(true), []);

  // Load search index
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

  // Search logic with debouncing
  useEffect(() => {
    if (!indexLoaded || !fuseRef.current || !query.trim()) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    const timeoutId = setTimeout(() => {
      setLoading(true);
      const fuse = fuseRef.current;
      const fuseResults = fuse!.search(query.trim(), { limit: maxResults });
      setResults(fuseResults.map(r => ({ ...r.item, score: r.score })));
      setIsOpen(fuseResults.length > 0);
      setLoading(false);
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [query, indexLoaded, maxResults]);

  // Calculate dropdown position
  const getDropdownStyle = useCallback(() => {
    if (!inputRef.current) return {};
    
    const rect = inputRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    
    // Ensure dropdown doesn't go off-screen
    let left = rect.left;
    if (left + 400 > viewportWidth) {
      left = viewportWidth - 420; // 400px width + 20px margin
    }
    if (left < 20) left = 20; // Minimum left margin
    
    return {
      position: 'fixed' as const,
      top: rect.bottom + 4,
      left: left,
      width: '400px',
      zIndex: 99999,
    };
  }, []);

  // Handle click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (inputRef.current && !inputRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        inputRef.current?.blur();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    if (value.trim().length > 0) {
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  // Handle input focus
  const handleInputFocus = () => {
    if (query.trim().length > 0 && results.length > 0) {
      setIsOpen(true);
    }
  };

  return (
    <>
      {variant === 'compact' ? (
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          placeholder={placeholder}
          className="w-48 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          autoComplete="off"
        />
      ) : (
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder={placeholder}
          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          debounce={300}
        />
      )}
      
      {/* Portal dropdown for compact variant */}
      {mounted && isOpen && variant === 'compact' && createPortal(
        <div
          style={getDropdownStyle()}
          className="bg-white border border-gray-200 rounded-lg shadow-xl max-h-80 overflow-hidden"
        >
          <div className="overflow-y-auto max-h-80">
            <SearchResults
              results={results}
              variant={variant}
              loading={loading}
              error={indexError}
              onResultClick={(result) => {
                window.location.href = result.url;
                setIsOpen(false);
              }}
            />
          </div>
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
            onResultClick={(result) => window.location.href = result.url}
          />
        </div>
      )}
    </>
  );
} 