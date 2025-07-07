import React from 'react';
import type { SearchResult } from '../../lib/search/types';

interface SearchResultsProps {
  results: SearchResult[];
  variant: 'compact' | 'full';
  onResultClick?: (result: SearchResult) => void;
  loading?: boolean;
  error?: string | null;
}

export function SearchResults({ results, variant, onResultClick, loading, error }: SearchResultsProps) {
  if (error) {
    return (
      <div className="p-4 text-red-600 bg-red-50 text-sm">{error}</div>
    );
  }
  if (loading) {
    return (
      <div className="p-4 text-gray-500 text-sm">Searching...</div>
    );
  }
  if (!results.length) {
    return (
      <div className="p-4 text-gray-400 text-sm">No results found</div>
    );
  }
  return (
    <ul className={
      variant === 'compact'
        ? 'w-full'
        : 'mt-4'
    }>
      {results.map(result => (
        <li
          key={result.slug}
          className="p-4 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0 transition-colors"
          onMouseDown={() => onResultClick?.(result)}
        >
          <div className="font-medium text-gray-900 line-clamp-1">{result.title}</div>
          <div className="text-sm text-gray-600 line-clamp-2 mt-1">{result.preview}</div>
        </li>
      ))}
    </ul>
  );
} 