"use client";
import React, { useMemo } from 'react';
import type { UnifiedSearchResult } from '../../types';
import { stripCircularDescription } from '../../utils/textCleanup';
import { getResultMediaUrl } from '../../utils/mediaUrl';
import { useLabels } from '../../hooks/useLabels';
import { debug } from '../../utils/log';

function classNames(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

function MediaPreview({ r }: { r: UnifiedSearchResult }) {
  const mediaUrl = getResultMediaUrl(r);
  if (r.content_type === 'image' && mediaUrl) {
    return (
      <img
        src={mediaUrl}
        alt={r.title}
        className="w-full h-40 object-cover rounded-md border border-neutral-800"
        draggable={false}
        loading="lazy"
        decoding="async"
        onError={(e) => {
          // Fallback to a placeholder if image fails to load
          const target = e.target as HTMLImageElement;
          target.style.display = 'none';
        }}
      />
    );
  }
  if (r.content_type === 'video' && mediaUrl) {
    return (
      <video
        src={mediaUrl}
        controls
        className="w-full h-40 object-cover rounded-md border border-neutral-800 bg-black"
      />
    );
  }
  if (r.content_type === 'audio' && mediaUrl) {
    return (
      <div className="w-full h-40 flex items-center justify-center rounded-md border border-neutral-800 bg-neutral-950">
        <audio src={mediaUrl} controls className="w-full px-2" />
      </div>
    );
  }
  if (r.content_type === 'layout') {
    return (
      <div className="w-full h-40 flex items-center justify-center rounded-md border border-neutral-800 bg-neutral-900 relative overflow-hidden">
        {/* Layout Preview Icon */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-4xl text-neutral-600">🎨</div>
        </div>

        {/* Layout Info Overlay */}
        <div className="absolute bottom-2 left-2 right-2 bg-black/70 rounded px-2 py-1">
          <div className="text-xs text-neutral-300">
            {r.metadata?.layout_type || 'Layout'} • {r.metadata?.item_count || 0} items
          </div>
          <div className="text-xs text-neutral-500">
            {r.metadata?.width || 0}×{r.metadata?.height || 0}
          </div>
        </div>

        {/* Mini Grid Representation */}
        <div className="absolute inset-4 opacity-20">
          <div className="w-full h-full border border-neutral-600" style={{
            backgroundImage: `
              linear-gradient(to right, #4b5563 1px, transparent 1px),
              linear-gradient(to bottom, #4b5563 1px, transparent 1px)
            `,
            backgroundSize: '8px 8px'
          }}>
            {/* Sample layout items */}
            <div className="absolute top-1 left-1 w-6 h-4 bg-blue-600/30 border border-blue-500/50 rounded-sm" />
            <div className="absolute top-1 right-1 w-4 h-6 bg-green-600/30 border border-green-500/50 rounded-sm" />
            <div className="absolute bottom-1 left-1 w-8 h-3 bg-purple-600/30 border border-purple-500/50 rounded-sm" />
          </div>
        </div>
      </div>
    );
  }
  return null;
}

function ResultCardComponent({
  r,
  onPin,
  onOpen,
  onLabelClick,
  selectionEnabled,
  selected,
  onToggleSelect,
  hidePin,
  hideExpand,
}: {
  r: UnifiedSearchResult;
  onPin: (r: UnifiedSearchResult) => void;
  onOpen: (r: UnifiedSearchResult) => void;
  onLabelClick?: (label: string) => void;
  selectionEnabled?: boolean;
  selected?: boolean;
  onToggleSelect?: (r: UnifiedSearchResult, shiftKey?: boolean) => void;
  hidePin?: boolean;
  hideExpand?: boolean;
}) {
  const scorePct = Math.round((Math.max(0, Math.min(1, r.score)) || 0) * 100);

  const labels = useLabels(r);

  const snippet: string = useMemo(() => {
    try {
      const base = r.preview ?? r.description ?? '';
      const raw = typeof base === 'string' ? base : JSON.stringify(base);
      const cleaned = stripCircularDescription(raw, { id: r.id, title: String(r.title ?? ''), type: r.content_type });

      // Different limits for different content types
      if (r.content_type === 'text') {
        // For text content, allow up to 70 words
        const words = cleaned.split(/\s+/);
        return words.length > 70 ? words.slice(0, 70).join(' ') + '...' : cleaned;
      } else {
        // For media (video/image/audio), enforce strict character limit for card consistency
        return cleaned.length > 100 ? cleaned.substring(0, 97) + '...' : cleaned;
      }
    } catch {
      return '';
    }
  }, [r.preview, r.description, r.title, r.content_type, r.id]);

  return (
    <div
      className={classNames(
        'group rounded-xl border border-neutral-800 bg-neutral-900/40 hover:bg-neutral-900 transition-colors overflow-hidden',
        selected ? 'ring-2 ring-neutral-500' : undefined,
      )}
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
      <div className="p-3 pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="text-xs px-2 py-0.5 border border-neutral-700 bg-neutral-800/60 text-neutral-300">
              {r.content_type}
            </div>
            <div className="text-[10px] text-neutral-400">{scorePct}%</div>
          </div>
          <div className="flex items-center gap-2">
            {!hidePin && (
             <button
              onClick={(e) => {
                e.stopPropagation();
                try {
                  onPin(r);
                } catch (err) {
                  debug('vs:card', 'pin-error', err);
                }
              }}
               className="w-5 h-5 flex items-center justify-center text-neutral-400 hover:text-neutral-200 transition-colors"
               title="Pin to canvas"
               aria-label="Pin to canvas"
            >
              📌
            </button>
            )}
            {!hideExpand && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                try {
                  onOpen(r);
                } catch (err) {
                  debug('vs:card', 'open-error', err);
                }
              }}
               className="w-5 h-5 flex items-center justify-center text-neutral-400 hover:text-neutral-200 transition-colors"
               title="Expand"
               aria-label="Expand"
            >
              ➕
            </button>
            )}
          </div>
        </div>
        <div className="mt-2 font-medium text-neutral-100 line-clamp-1" title={r.title}>
          {r.title}
        </div>
      </div>
      <div className="px-3">
        <MediaPreview r={r} />
      </div>
      <div className={classNames(
        "p-3 flex flex-col justify-between",
        r.content_type === 'text' ? "min-h-32" : "h-24"
      )}>
        <div className="flex-1">
          {snippet && <p className={classNames(
            "text-sm text-neutral-300",
            r.content_type === 'text' ? "line-clamp-6" : "line-clamp-2"
          )}>{snippet}</p>}
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {labels.slice(0, 4).map((l, idx) => (
            <button
              key={`${l}-${idx}`}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onLabelClick?.(l);
              }}
              className="text-[10px] px-2 py-0.5 rounded-full border border-neutral-800 bg-neutral-950 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 transition-colors"
            >
              {l}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ResultCardComponent;


