"use client";

import React from 'react';

type Props = {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  showPageNumbers?: boolean;
  maxVisiblePages?: number;
};

export default function Pagination({ 
  currentPage, 
  totalPages, 
  onPageChange,
  showPageNumbers = true,
  maxVisiblePages = 5
}: Props) {
  if (totalPages <= 1) return null;

  const canGoPrev = currentPage > 1;
  const canGoNext = currentPage < totalPages;

  // Calculate visible page numbers
  const getVisiblePages = () => {
    if (totalPages <= maxVisiblePages) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const half = Math.floor(maxVisiblePages / 2);
    let start = Math.max(1, currentPage - half);
    let end = Math.min(totalPages, start + maxVisiblePages - 1);

    if (end - start + 1 < maxVisiblePages) {
      start = Math.max(1, end - maxVisiblePages + 1);
    }

    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  };

  const visiblePages = getVisiblePages();

  return (
    <div className="flex items-center justify-center gap-2 mt-6">
      {/* Previous Button */}
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={!canGoPrev}
        className="px-3 py-2 text-sm border border-neutral-700 bg-neutral-800 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-neutral-700 transition-colors"
      >
        Previous
      </button>

      {/* Page Numbers */}
      {showPageNumbers && (
        <>
          {visiblePages[0] > 1 && (
            <>
              <button
                onClick={() => onPageChange(1)}
                className="px-3 py-2 text-sm border border-neutral-700 bg-neutral-800 text-white rounded hover:bg-neutral-700 transition-colors"
              >
                1
              </button>
              {visiblePages[0] > 2 && (
                <span className="px-2 text-neutral-400">...</span>
              )}
            </>
          )}

          {visiblePages.map((page) => (
            <button
              key={page}
              onClick={() => onPageChange(page)}
              className={`px-3 py-2 text-sm border rounded transition-colors ${
                page === currentPage
                  ? 'border-blue-500 bg-blue-600 text-white'
                  : 'border-neutral-700 bg-neutral-800 text-white hover:bg-neutral-700'
              }`}
            >
              {page}
            </button>
          ))}

          {visiblePages[visiblePages.length - 1] < totalPages && (
            <>
              {visiblePages[visiblePages.length - 1] < totalPages - 1 && (
                <span className="px-2 text-neutral-400">...</span>
              )}
              <button
                onClick={() => onPageChange(totalPages)}
                className="px-3 py-2 text-sm border border-neutral-700 bg-neutral-800 text-white rounded hover:bg-neutral-700 transition-colors"
              >
                {totalPages}
              </button>
            </>
          )}
        </>
      )}

      {/* Next Button */}
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={!canGoNext}
        className="px-3 py-2 text-sm border border-neutral-700 bg-neutral-800 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-neutral-700 transition-colors"
      >
        Next
      </button>

      {/* Page Info */}
      <div className="ml-4 text-sm text-neutral-400">
        Page {currentPage} of {totalPages}
      </div>
    </div>
  );
}
