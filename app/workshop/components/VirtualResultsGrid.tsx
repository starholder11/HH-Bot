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
  // Progressive mount: render a small subset first, then grow in idle time
  const [visibleCount, setVisibleCount] = useState<number>(Math.min(24, results.length));

  // Calculate visible range
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(
    results.length - 1,
    Math.floor((scrollTop + containerHeight) / itemHeight) + overscan
  );

  // Progressive cap to avoid mounting too many nodes at once
  const cappedEnd = Math.min(endIndex + 1, visibleCount);
  const visibleItems = results.slice(startIndex, cappedEnd);
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

  // When results change, reset progressive count
  useEffect(() => {
    setVisibleCount(Math.min(24, results.length));
  }, [results]);

  // Incrementally increase the number of mounted items without blocking paint
  useEffect(() => {
    if (visibleCount >= results.length) return;
    let raf: ReturnType<typeof setTimeout> | null = null;
    let idle: any = null;

    const grow = () => {
      setVisibleCount((prev) => {
        if (prev >= results.length) return prev;
        // Increase in small batches to keep FPS smooth
        const next = Math.min(results.length, prev + 16);
        return next;
      });
    };

    const schedule = () => {
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        idle = (window as any).requestIdleCallback(grow, { timeout: 120 });
      } else {
        raf = setTimeout(grow, 60);
      }
    };

    schedule();
    return () => {
      if (idle) (window as any).cancelIdleCallback?.(idle);
      if (raf) clearTimeout(raf as any);
    };
  }, [visibleCount, results.length]);

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
                {renderCard({ ...(result as any), _idx: startIndex + idx }, startIndex + idx)}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
