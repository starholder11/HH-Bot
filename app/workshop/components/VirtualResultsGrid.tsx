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
  overscan = 10      // Render more ahead to feel instant
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [containerTop, setContainerTop] = useState(0);
  // Progressive mount: render a generous subset first, then grow fast
  const [visibleCount, setVisibleCount] = useState<number>(Math.min(48, results.length));
  // Persist already-mounted items so scrolling back up does not unmount them
  const [persistedEnd, setPersistedEnd] = useState<number>(Math.min(48, results.length));

  // Calculate visible range
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(
    results.length - 1,
    Math.floor((scrollTop + containerHeight) / itemHeight) + overscan
  );

  // Progressive cap to avoid mounting too many nodes at once
  const cappedEnd = Math.min(endIndex + 1, visibleCount);
  const nextPersistedEnd = Math.max(persistedEnd, cappedEnd);
  const visibleItems = results.slice(0, nextPersistedEnd);
  const totalHeight = results.length * itemHeight;
  const offsetY = 0; // We render from the top, keeping earlier items mounted

  // Handle scroll events
  const handleScroll = useCallback(() => {
    const y = window.scrollY || window.pageYOffset || 0;
    const relative = Math.max(0, y - containerTop);
    setScrollTop(relative);
  }, [containerTop]);

  // Setup scroll listener and measure container against window scroll
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const measure = () => {
      const rect = container.getBoundingClientRect();
      const top = rect.top + (window.scrollY || window.pageYOffset || 0);
      setContainerTop(top);
      setContainerHeight(window.innerHeight);
      // Update current scrollTop immediately
      const y = window.scrollY || window.pageYOffset || 0;
      setScrollTop(Math.max(0, y - top));
    };

    measure();
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', measure);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', measure);
    };
  }, [handleScroll]);

  // When results change, reset progressive count
  useEffect(() => {
    const initial = Math.min(48, results.length);
    setVisibleCount(initial);
    setPersistedEnd(initial);
  }, [results]);

  // Incrementally increase the number of mounted items without blocking paint
  useEffect(() => {
    if (visibleCount >= results.length) return;
    let raf: ReturnType<typeof setTimeout> | null = null;
    let idle: any = null;

    const grow = () => {
      setVisibleCount((prev) => {
        if (prev >= results.length) return prev;
        // Increase in larger batches to avoid visible pop-in
        const next = Math.min(results.length, prev + 24);
        return next;
      });
      setPersistedEnd((prev) => Math.min(results.length, Math.max(prev, visibleCount + 24)));
    };

    const schedule = () => {
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        idle = (window as any).requestIdleCallback(grow, { timeout: 16 });
      } else {
        raf = setTimeout(grow, 16);
      }
    };

    schedule();
    return () => {
      if (idle) (window as any).cancelIdleCallback?.(idle);
      if (raf) clearTimeout(raf as any);
    };
  }, [visibleCount, results.length]);

  return (
    <div ref={containerRef}>
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
