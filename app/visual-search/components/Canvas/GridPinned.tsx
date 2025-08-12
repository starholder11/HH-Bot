"use client";
import React from 'react';
import type { PinnedItem, UnifiedSearchResult } from '../../types';
import { getResultMediaUrl } from '../../utils/mediaUrl';
import { stripCircularDescription } from '../../utils/textCleanup';

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
      />
    );
  }
  if (r.content_type === 'video' && mediaUrl) {
    return (
      <video src={mediaUrl} controls className="w-full h-40 object-cover rounded-md border border-neutral-800 bg-black" />
    );
  }
  if (r.content_type === 'audio' && mediaUrl) {
    return (
      <div className="w-full h-40 flex items-center justify-center rounded-md border border-neutral-800 bg-neutral-950">
        <audio src={mediaUrl} controls className="w-full px-2" />
      </div>
    );
  }
  return null;
}

export default function GridPinned({
  items,
  onReorder,
  onRemove,
  onOpen,
}: {
  items: PinnedItem[];
  onReorder: (fromIndex: number, toIndex: number) => void;
  onRemove: (id: string) => void;
  onOpen: (r: UnifiedSearchResult) => void;
}) {
  const dragFrom = React.useRef<number | null>(null);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {items.map((p, idx) => (
        <div
          key={p.id}
          draggable
          onDragStart={(e) => {
            dragFrom.current = idx;
            try {
              e.dataTransfer.setData('text/plain', String(idx));
            } catch {}
          }}
          onDragOver={(e) => {
            e.preventDefault();
          }}
          onDrop={(e) => {
            e.preventDefault();
            const from = dragFrom.current ?? (() => {
              try {
                return Number(e.dataTransfer.getData('text/plain'));
              } catch {
                return NaN;
              }
            })();
            const to = idx;
            if (Number.isFinite(from) && from !== to) onReorder(from as number, to);
            dragFrom.current = null;
          }}
          className="rounded-xl border border-neutral-800 bg-neutral-900/40 hover:bg-neutral-900 transition-colors overflow-hidden"
        >
          {/* Header with title and controls */}
          <div className="p-3 pb-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="text-xs px-2 py-0.5 border border-neutral-700 bg-neutral-800/60 text-neutral-300">
                  {p.result.content_type}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onOpen(p.result)}
                  className="w-5 h-5 flex items-center justify-center text-neutral-400 hover:text-neutral-200 transition-colors"
                  title="Expand"
                  aria-label="Expand"
                >
                  ➕
                </button>
                <button
                  onClick={() => onRemove(p.id)}
                  className="w-5 h-5 flex items-center justify-center text-neutral-400 hover:text-neutral-200 transition-colors"
                  title="Remove from canvas"
                  aria-label="Remove from canvas"
                >
                  ❌
                </button>
              </div>
            </div>
            <div className="mt-2 font-medium text-neutral-100 line-clamp-1" title={p.result.title}>
              {p.result.title}
            </div>
          </div>

          {/* Media Preview */}
          <div className="px-3">
            <MediaPreview r={p.result} />
          </div>

          {/* Description */}
          <div className="p-3">
            {(() => {
              const base = p.result.preview ?? p.result.description ?? '';
              const raw = typeof base === 'string' ? base : JSON.stringify(base);
              const cleaned = stripCircularDescription(raw, { 
                id: p.result.id, 
                title: String(p.result.title ?? ''), 
                type: p.result.content_type 
              });
              
              // Different limits for different content types
              const snippet = p.result.content_type === 'text' 
                ? (cleaned.split(/\s+/).length > 70 ? cleaned.split(/\s+/).slice(0, 70).join(' ') + '...' : cleaned)
                : (cleaned.length > 100 ? cleaned.substring(0, 97) + '...' : cleaned);
                
              return snippet ? (
                <p className={`text-sm text-neutral-300 ${
                  p.result.content_type === 'text' ? 'line-clamp-4' : 'line-clamp-2'
                }`}>
                  {snippet}
                </p>
              ) : null;
            })()}
          </div>
        </div>
      ))}
    </div>
  );
}



