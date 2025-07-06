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
      <div className="p-2 text-red-600 bg-red-50 rounded shadow text-sm">{error}</div>
    );
  }
  if (loading) {
    return (
      <div className="p-2 text-gray-500 bg-white rounded shadow text-sm">Searching...</div>
    );
  }
  if (!results.length) {
    return (
      <div className="p-2 text-gray-400 bg-white rounded shadow text-sm">No results found</div>
    );
  }
  return (
    <ul className={variant === 'compact' ? 'bg-white rounded shadow mt-2 w-80 max-h-80 overflow-auto' : 'mt-4'}>
      {results.map(result => (
        <li
          key={result.slug}
          className="p-2 hover:bg-blue-50 cursor-pointer border-b last:border-b-0"
          onClick={() => onResultClick?.(result)}
        >
          <div className="font-semibold text-blue-700 truncate">{result.title}</div>
          <div className="text-xs text-gray-500 truncate">{result.preview}</div>
        </li>
      ))}
    </ul>
  );
} 