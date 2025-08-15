"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { UnifiedSearchResult } from '../types';

type Props = {
  results: UnifiedSearchResult[];
  renderCard: (r: UnifiedSearchResult, idx: number) => React.ReactNode;
  itemHeight?: number;
  overscan?: number;
};

// Virtual scrolling implementation for better performance with large result sets
export default function VirtualResultsGrid({ 
  results, 
  renderCard, 
  itemHeight = 280,  // Approximate height of each result card
  overscan = 5       // Number of items to render outside viewport
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  // Calculate visible range
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(
    results.length - 1,
    Math.floor((scrollTop + containerHeight) / itemHeight) + overscan
  );

  const visibleItems = results.slice(startIndex, endIndex + 1);
  const totalHeight = results.length * itemHeight;
  const offsetY = startIndex * itemHeight;

  // Handle scroll events
  const handleScroll = useCallback(() => {
    if (containerRef.current) {
      setScrollTop(containerRef.current.scrollTop);
    }
  }, []);

  // Setup scroll listener and measure container
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateContainerHeight = () => {
      setContainerHeight(container.clientHeight);
    };

    updateContainerHeight();
    container.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', updateContainerHeight);

    return () => {
      container.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', updateContainerHeight);
    };
  }, [handleScroll]);

  return (
    <div 
      ref={containerRef}
      className="h-full overflow-auto"
      style={{ height: '600px' }} // Set a fixed height for scrolling
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div 
          style={{ 
            transform: `translateY(${offsetY}px)`,
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
          }}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleItems.map((result, idx) => (
              <div key={result.id ?? (startIndex + idx)} className="w-full">
                {renderCard(result, startIndex + idx)}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
