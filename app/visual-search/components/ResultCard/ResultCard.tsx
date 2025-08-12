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
}: {
  r: UnifiedSearchResult;
  onPin: (r: UnifiedSearchResult) => void;
  onOpen: (r: UnifiedSearchResult) => void;
  onLabelClick?: (label: string) => void;
  selectionEnabled?: boolean;
  selected?: boolean;
  onToggleSelect?: (r: UnifiedSearchResult, shiftKey?: boolean) => void;
}) {
  const scorePct = Math.round((Math.max(0, Math.min(1, r.score)) || 0) * 100);

  const labels = useLabels(r);

  const snippet: string = useMemo(() => {
    try {
      const base = r.preview ?? r.description ?? '';
      const raw = typeof base === 'string' ? base : JSON.stringify(base);
      const cleaned = stripCircularDescription(raw, { id: r.id, title: String(r.title ?? ''), type: r.content_type });
      // Enforce a strict character limit for card consistency (approximately 2 lines max)
      return cleaned.length > 100 ? cleaned.substring(0, 97) + '...' : cleaned;
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
          </div>
        </div>
        <div className="mt-2 font-medium text-neutral-100 line-clamp-1" title={r.title}>
          {r.title}
        </div>
      </div>
      <div className="px-3">
        <MediaPreview r={r} />
      </div>
      <div className="p-3 h-24 flex flex-col justify-between">
        <div className="flex-1">
          {snippet && <p className="text-sm text-neutral-300 line-clamp-2">{snippet}</p>}
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


