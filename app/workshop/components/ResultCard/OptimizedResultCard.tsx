"use client";
import React, { useState, useEffect, useRef } from 'react';
import type { UnifiedSearchResult } from '../../types';
import { getResultMediaUrl } from '../../utils/mediaUrl';

// Minimal initial render - only show placeholder and essential info
function OptimizedResultCard({
  r,
  onPin,
  onOpen,
  onLabelClick,
  selectionEnabled,
  selected,
  onToggleSelect,
}: {
  r: UnifiedSearchResult;
  onPin: (r: UnifiedSearchResult) => void;
  onOpen: (r: UnifiedSearchResult) => void;
  onLabelClick?: (label: string) => void;
  selectionEnabled?: boolean;
  selected?: boolean;
  onToggleSelect?: (r: UnifiedSearchResult, shiftKey?: boolean) => void;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Intersection observer for lazy loading
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );

    if (cardRef.current) {
      observer.observe(cardRef.current);
    }

    return () => observer.disconnect();
  }, []);

  const scorePct = Math.round((r.score || 0) * 100);

  return (
    <div
      ref={cardRef}
      className={`group rounded-xl border border-neutral-800 bg-neutral-900/40 hover:bg-neutral-900 transition-colors overflow-hidden cursor-pointer ${
        selected ? 'ring-2 ring-neutral-500' : ''
      }`}
      onClick={(e) => {
        if (e.shiftKey && onToggleSelect) {
          onToggleSelect(r, true);
        } else if (selectionEnabled && onToggleSelect) {
          onToggleSelect(r, false);
        } else {
          onOpen(r);
        }
      }}
    >
      {/* Header - always rendered */}
      <div className="p-3 pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="text-xs px-2 py-0.5 border border-neutral-700 bg-neutral-800/60 text-neutral-300">
              {r.content_type}
            </div>
            <div className="text-[10px] text-neutral-400">{scorePct}%</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPin(r);
              }}
              className="w-5 h-5 flex items-center justify-center text-neutral-400 hover:text-neutral-200 transition-colors"
              title="Pin to canvas"
            >
              📌
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpen(r);
              }}
              className="w-5 h-5 flex items-center justify-center text-neutral-400 hover:text-neutral-200 transition-colors"
              title="Expand"
            >
              ➕
            </button>
          </div>
        </div>
        <div className="mt-2 font-medium text-neutral-100 line-clamp-1" title={r.title}>
          {r.title}
        </div>
      </div>

      {/* Media - only render when visible */}
      <div className="px-3">
        {isVisible ? (
          r.content_type === 'image' && getResultMediaUrl(r) ? (
            <img
              src={getResultMediaUrl(r)!}
              alt={r.title}
              className="w-full h-40 object-cover rounded-md border border-neutral-800"
              loading="lazy"
              decoding="async"
              onLoad={() => setImageLoaded(true)}
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : r.content_type === 'video' && getResultMediaUrl(r) ? (
            <video
              src={getResultMediaUrl(r)!}
              className="w-full h-40 object-cover rounded-md border border-neutral-800 bg-black"
              muted
              playsInline
              preload="none"
            />
          ) : r.content_type === 'audio' ? (
            <div className="w-full h-40 flex items-center justify-center rounded-md border border-neutral-800 bg-neutral-950">
              <div className="text-2xl text-neutral-300">🎵</div>
            </div>
          ) : (
            <div className="w-full h-40 flex items-center justify-center rounded-md border border-neutral-800 bg-neutral-800 text-neutral-400 text-xs">
              {r.content_type}
            </div>
          )
        ) : (
          // Placeholder while not visible
          <div className="w-full h-40 bg-neutral-700 rounded-md animate-pulse"></div>
        )}
      </div>

      {/* Content - simplified */}
      <div className="p-3 h-16 flex flex-col justify-between">
        <div className="flex-1">
          {r.preview && (
            <p className="text-sm text-neutral-300 line-clamp-2">
              {r.preview.substring(0, 100)}...
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default OptimizedResultCard;
