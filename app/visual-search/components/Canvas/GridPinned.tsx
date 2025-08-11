"use client";
import React from 'react';
import type { PinnedItem, UnifiedSearchResult } from '../../types';
import { getResultMediaUrl } from '../../utils/mediaUrl';

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
          className="rounded-xl border border-neutral-800 bg-neutral-950 overflow-hidden"
        {
          ...{}}
        >
          <div className="p-2 border-b border-neutral-800 flex items-center justify-between gap-2 bg-neutral-900/50">
            <div className="text-xs text-neutral-300 truncate" title={p.result.title}>
              {p.result.title}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => onOpen(p.result)}
                className="px-2 py-1 text-xs rounded-md border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-neutral-100"
              >
                Expand
              </button>
              <button
                onClick={() => onRemove(p.id)}
                className="px-2 py-1 text-xs rounded-md border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-neutral-100"
              >
                Remove
              </button>
            </div>
          </div>
          <div className="p-2">
            <MediaPreview r={p.result} />
          </div>
        </div>
      ))}
    </div>
  );
}



