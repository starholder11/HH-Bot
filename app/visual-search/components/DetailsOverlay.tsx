"use client";
import React, { useEffect, useMemo, useState } from 'react';
import type { UnifiedSearchResult } from '../types';
import { getResultMediaUrl } from '../utils/mediaUrl';

export default function DetailsOverlay({ r, onClose }: { r: UnifiedSearchResult | null; onClose: () => void }) {
  const [fullText, setFullText] = useState<string | null>(null);
  const [isLoadingText, setIsLoadingText] = useState<boolean>(false);
  const [textError, setTextError] = useState<string | null>(null);

  if (!r) return null;

  // Extra safety: wrap entire component in try-catch
  try {

  const mediaUrl = getResultMediaUrl(r);
  const sourceUrlRaw: unknown = (r.metadata?.source_url as unknown) ?? mediaUrl ?? r.url;
  const sourceUrl: string | undefined = typeof sourceUrlRaw === 'string' && sourceUrlRaw.length > 0 ? sourceUrlRaw : undefined;

  // Ensure we never try to render objects/arrays directly in JSX
  const toDisplayText = (value: unknown, fallback: string = ''): string => {
    try {
      if (value == null) return fallback;
      if (typeof value === 'string') return value;
      if (typeof value === 'number' || typeof value === 'boolean') return String(value);
      if (typeof value === 'object') {
        // Avoid huge dumps; provide compact, readable info
        const json = JSON.stringify(value, null, 2);
        return json?.slice(0, 4000) || fallback; // hard cap to avoid huge renders
      }
      return String(value);
    } catch {
      return fallback;
    }
  };

  const extractSlugFromResult = (res: UnifiedSearchResult): string | null => {
    try {
      const parentUnknown: unknown = (res as any)?.metadata?.parent_slug;
      if (typeof parentUnknown === 'string' && parentUnknown.length > 0) {
        const parts = parentUnknown.split('/');
        return parts.length > 0 ? parts[parts.length - 1] : parentUnknown;
      }
      if (typeof res.id === 'string' && res.id.startsWith('text_')) {
        const after = res.id.split('text_')[1] ?? '';
        const beforeHash = after.split('#')[0] ?? '';
        const subParts = beforeHash.split('/');
        return subParts.length > 1 ? subParts[subParts.length - 1] : beforeHash || null;
      }
    } catch {}
    return null;
  };

  useEffect(() => {
    let cancelled = false;
    
    setFullText(null);
    setTextError(null);
    setIsLoadingText(false);
    
    if (r && r.content_type === 'text') {
      const slug = extractSlugFromResult(r);
      if (!slug) return;
      
      setIsLoadingText(true);
      fetch(`/api/internal/get-content/${encodeURIComponent(slug)}`)
        .then(async (res) => {
          if (cancelled) return; // Don't update state if component unmounted
          
          const json = await res.json();
          if (!res.ok || !json?.success) {
            throw new Error(json?.error || 'Failed to load content');
          }
          
          if (!cancelled) {
            setFullText(json.content as string);
          }
        })
        .catch((e) => {
          if (!cancelled) {
            setTextError((e as Error).message);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsLoadingText(false);
          }
        });
    }
    
    return () => {
      cancelled = true;
    };
  }, [r?.id]);

  return (
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full sm:w-[560px] bg-neutral-950 border-l border-neutral-800 shadow-xl flex flex-col">
        <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
          <div>
            <div className="text-xs text-neutral-400">{r.content_type}</div>
            <div className="text-lg font-semibold text-neutral-100">{toDisplayText(r.title, 'Untitled')}</div>
          </div>
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded-md border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-neutral-100">
            Close
          </button>
        </div>
        <div className="p-4 space-y-4 overflow-auto">
          {r.content_type === 'text' ? (
            <div className="text-sm leading-6 text-neutral-200 whitespace-pre-wrap">
              {isLoadingText && <div className="text-neutral-400">Loading full text…</div>}
              {!isLoadingText && textError && <div className="text-red-400">{textError}</div>}
              {!isLoadingText && !textError && (
                <>
                  {fullText || toDisplayText(r.preview, toDisplayText(r.description, 'No content available.'))}
                </>
              )}
            </div>
          ) : (
            <>
              {mediaUrl && (r.content_type === 'image' ? (
                <img src={mediaUrl} alt={r.title} className="w-full rounded-md border border-neutral-800 bg-black" />
              ) : r.content_type === 'video' ? (
                <video src={mediaUrl} controls className="w-full rounded-md border border-neutral-800 bg-black" />
              ) : r.content_type === 'audio' ? (
                <div className="p-2"><audio src={mediaUrl} controls className="w-full" /></div>
              ) : null)}
              <div className="text-sm leading-6 text-neutral-200 whitespace-pre-wrap">
                {toDisplayText(r.preview, toDisplayText(r.description, 'No additional preview available.'))}
              </div>
            </>
          )}
          {sourceUrl && (
            <div>
              <a href={sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-neutral-100">
                Open source
                <span className="text-neutral-500">↗</span>
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  } catch (error) {
    console.error('DetailsOverlay render error:', error);
    return (
      <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center">
        <div className="bg-red-900 text-white p-4 rounded-lg max-w-md">
          <h3>Error loading details</h3>
          <p className="text-sm mt-2">Failed to render overlay for: {r?.id || 'unknown'}</p>
          <button onClick={onClose} className="bg-red-700 px-3 py-1 rounded mt-3">Close</button>
        </div>
      </div>
    );
  }
}



