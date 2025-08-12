"use client";
import React, { useRef } from 'react';
import type { PinnedItem, UnifiedSearchResult } from '../../types';

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
      className="absolute rounded-xl border border-neutral-800 bg-neutral-950 shadow-lg overflow-hidden"
      style={{ left: item.x, top: item.y, width: item.width, height: item.height, zIndex: item.z }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div className="p-2 border-b border-neutral-800 flex items-center justify-between gap-2 bg-neutral-900/50">
        <div className="text-xs text-neutral-300 truncate" title={item.result.title}>
          {item.result.title}
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
            className="px-2 py-1 text-xs rounded-md border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-neutral-100"
          >
            Expand
          </button>
          <button onClick={() => onRemove(item.id)} className="px-2 py-1 text-xs rounded-md border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-neutral-100">Remove</button>
        </div>
      </div>
    </div>
  );
}



