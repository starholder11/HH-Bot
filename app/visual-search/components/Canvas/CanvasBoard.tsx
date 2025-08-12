"use client";
import React, { useRef } from 'react';
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
        className="w-full h-32 object-cover rounded-md border border-neutral-800"
        draggable={false}
        loading="lazy"
      />
    );
  }
  if (r.content_type === 'video' && mediaUrl) {
    return (
      <video src={mediaUrl} controls className="w-full h-32 object-cover rounded-md border border-neutral-800 bg-black" />
    );
  }
  if (r.content_type === 'audio' && mediaUrl) {
    return (
      <div className="w-full h-32 flex items-center justify-center rounded-md border border-neutral-800 bg-neutral-950">
        <audio src={mediaUrl} controls className="w-full px-2" />
      </div>
    );
  }
  return null;
}

export default function CanvasBoard({
  items,
  onMove,
  onRemove,
  onOpen,
}: {
  items: PinnedItem[];
  onMove: (id: string, x: number, y: number) => void;
  onRemove: (id: string) => void;
  onOpen: (r: UnifiedSearchResult) => void;
}) {
  return (
    <div className="relative w-full h-[640px] rounded-xl border border-neutral-800 bg-neutral-950 overflow-hidden">
      {items.map((item) => (
        <Pinned key={item.id} item={item} onMove={onMove} onRemove={onRemove} onOpen={onOpen} />
      ))}
    </div>
  );
}

function Pinned({
  item,
  onMove,
  onRemove,
  onOpen,
}: {
  item: PinnedItem;
  onMove: (id: string, x: number, y: number) => void;
  onRemove: (id: string) => void;
  onOpen: (r: UnifiedSearchResult) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);
  const offset = useRef({ x: 0, y: 0 });

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!ref.current) return;
    dragging.current = true;
    const rect = ref.current.getBoundingClientRect();
    offset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const parentRect = ref.current?.parentElement?.getBoundingClientRect();
    const newX = e.clientX - offset.current.x - (parentRect?.left || 0);
    const newY = e.clientY - offset.current.y - (parentRect?.top || 0);
    onMove(item.id, Math.max(0, newX), Math.max(0, newY));
  };
  const handlePointerUp = (e: React.PointerEvent) => {
    dragging.current = false;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  };

  return (
    <div
      ref={ref}
      className="absolute rounded-xl border border-neutral-800 bg-neutral-900/40 shadow-lg overflow-hidden"
      style={{ left: item.x, top: item.y, width: item.width, height: item.height, zIndex: item.z }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Header */}
      <div className="p-2 border-b border-neutral-800 flex items-center justify-between gap-2 bg-neutral-900/50">
        <div className="flex items-center gap-2">
          <div className="text-[10px] px-1.5 py-0.5 border border-neutral-700 bg-neutral-800/60 text-neutral-300">
            {item.result.content_type}
          </div>
          <div className="text-xs text-neutral-300 truncate" title={item.result.title}>
            {item.result.title}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              try {
                if (item?.result && typeof item.result === 'object' && (item.result as any).id) {
                  onOpen(item.result);
                }
              } catch (e) {
                console.error('Canvas expand error:', e);
              }
            }}
            className="w-4 h-4 flex items-center justify-center text-neutral-400 hover:text-neutral-200 text-[10px]"
            title="Expand"
          >
            ➕
          </button>
          <button 
            onClick={() => onRemove(item.id)} 
            className="w-4 h-4 flex items-center justify-center text-neutral-400 hover:text-neutral-200 text-[10px]"
            title="Remove"
          >
            ❌
          </button>
        </div>
      </div>

      {/* Media Content */}
      <div className="p-2">
        <MediaPreview r={item.result} />
      </div>

      {/* Description */}
      <div className="p-2 pt-0">
        {(() => {
          const base = item.result.preview ?? item.result.description ?? '';
          const raw = typeof base === 'string' ? base : JSON.stringify(base);
          const cleaned = stripCircularDescription(raw, { 
            id: item.result.id, 
            title: String(item.result.title ?? ''), 
            type: item.result.content_type 
          });
          
          const snippet = item.result.content_type === 'text' 
            ? (cleaned.split(/\s+/).length > 40 ? cleaned.split(/\s+/).slice(0, 40).join(' ') + '...' : cleaned)
            : (cleaned.length > 80 ? cleaned.substring(0, 77) + '...' : cleaned);
            
          return snippet ? (
            <p className="text-xs text-neutral-300 line-clamp-3">
              {snippet}
            </p>
          ) : null;
        })()}
      </div>
    </div>
  );
}



