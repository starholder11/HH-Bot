"use client";
import React, { useState, useEffect, useRef } from 'react';
import type { UnifiedSearchResult } from '../../types';
import { getResultMediaUrl } from '../../utils/mediaUrl';
import { stripCircularDescription } from '../../utils/textCleanup';

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

  // Prepare text snippet (used for text results and fallback)
  const textSnippet: string | null = (() => {
    if (r.content_type !== 'text') return null;
    const meta: any = (r as any).metadata || {};
    const base =
      r.preview ??
      (r as any).description ??
      meta.excerpt ??
      meta.summary ??
      meta.text ??
      meta.content ??
      meta.body ??
      meta.chunk_text ??
      meta.chunkText ??
      meta.raw ??
      '';
    try {
      const raw = typeof base === 'string' ? base : JSON.stringify(base);
      const cleaned = stripCircularDescription(raw, { id: r.id, title: String(r.title ?? ''), type: r.content_type });
      const words = cleaned.split(/\s+/);
      // Allow a larger preview so cards are informative
      return words.length > 120 ? `${words.slice(0, 120).join(' ')}…` : cleaned;
    } catch {
      return typeof base === 'string' ? base.slice(0, 320) : '';
    }
  })();

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
          // Images
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
          // Videos
          ) : r.content_type === 'video' && getResultMediaUrl(r) ? (
            <video
              src={getResultMediaUrl(r)!}
              className="w-full h-40 object-cover rounded-md border border-neutral-800 bg-black"
              controls
              muted
              playsInline
              preload="metadata"
            />
          // Audio
          ) : r.content_type === 'audio' && getResultMediaUrl(r) ? (
            <div className="w-full h-40 flex items-center justify-center rounded-md border border-neutral-800 bg-neutral-950">
              <audio src={getResultMediaUrl(r)!} controls preload="metadata" className="w-full" />
            </div>
          // Text
          ) : r.content_type === 'text' && textSnippet ? (
            <div className="w-full rounded-md border border-neutral-800 bg-neutral-900 text-neutral-200 p-3 max-h-48 overflow-hidden" title={textSnippet}>
              <div className="text-xs leading-snug whitespace-pre-wrap break-words">
                {textSnippet}
              </div>
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

      {/* Content - simplified (skip duplicate for text since shown above) */}
      {r.content_type !== 'text' && (
        <div className="p-3 h-16 flex flex-col justify-between">
          <div className="flex-1">
            {(r.preview || (r as any).description) && (
              <p className="text-sm text-neutral-300 line-clamp-2">
                {String(r.preview ?? (r as any).description).substring(0, 140)}
                {String(r.preview ?? (r as any).description).length > 140 ? '…' : ''}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default OptimizedResultCard;
