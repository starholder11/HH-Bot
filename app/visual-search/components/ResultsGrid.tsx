"use client";
import React from 'react';
import type { UnifiedSearchResult } from '../types';

type Props = {
  results: UnifiedSearchResult[];
  renderCard: (r: UnifiedSearchResult, idx: number) => React.ReactNode;
};

// CSS Grid implementation: fixed 3 columns on large screens, 2 on tablets, 1 on mobile.
// Cards take equal width columns; container grows fluidly with the viewport.
export default function ResultsGrid({ results, renderCard }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {results.map((r, idx) => (
        <div key={(r as any).id ?? idx} className="w-full">
          {renderCard(r, idx)}
        </div>
      ))}
    </div>
  );
}

// Exported directly; wrap at a higher level to avoid per-cell boundary overhead


