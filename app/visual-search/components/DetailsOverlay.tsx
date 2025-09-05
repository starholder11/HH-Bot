"use client";
import React, { useEffect, useMemo, useState, Suspense } from 'react';
import type { UnifiedSearchResult } from '../types';
import { getResultMediaUrl } from '../utils/mediaUrl';
import MediaMetadata from './MediaMetadata';
import dynamic from 'next/dynamic';
import ContinueConversationButton from '@/components/lore/ContinueConversationButton';

const LayoutViewer = dynamic(() => import('./Layout/LayoutViewer'), {
  ssr: false,
  loading: () => <div className="w-full h-64 bg-neutral-900 rounded border border-neutral-800 flex items-center justify-center text-neutral-400">Loading layout...</div>
});

export default function DetailsOverlay({ r, onClose, onSearch }: {
  r: UnifiedSearchResult | null;
  onClose: () => void;
  onSearch?: (query: string) => void;
}) {
  const [fullText, setFullText] = useState<string | null>(null);
  const [isLoadingText, setIsLoadingText] = useState<boolean>(false);
  const [textError, setTextError] = useState<string | null>(null);
  const [fullAsset, setFullAsset] = useState<any | null>(null);
  const [isLoadingAsset, setIsLoadingAsset] = useState<boolean>(false);
  const [assetError, setAssetError] = useState<string | null>(null);

  // Removed scroll locking - let main page scroll naturally

    // Move hooks BEFORE any early returns to follow Rules of Hooks

  // Fetch full asset metadata for media types
  useEffect(() => {
    let cancelled = false;

    setFullAsset(null);
    setAssetError(null);
    setIsLoadingAsset(false);

    if (r && ['image', 'video', 'audio', 'layout'].includes(r.content_type)) {
      setIsLoadingAsset(true);
      
      // Different content types use different API endpoints
      const apiEndpoint = r.content_type === 'audio' 
        ? `/api/audio-labeling/songs/${r.id}`
        : `/api/media-assets/${r.id}`;
      
      fetch(apiEndpoint)
        .then(async (res) => {
          if (cancelled) return;

          const json = await res.json();
          
          // Handle different response formats
          if (r.content_type === 'audio') {
            // Audio API returns song data directly
            if (!res.ok || !json) {
              throw new Error('Failed to load audio metadata');
            }
            if (!cancelled) {
              setFullAsset(json);
            }
          } else {
            // Media assets API returns { success, asset }
            if (!res.ok || !json?.success) {
              throw new Error(json?.error || 'Failed to load asset metadata');
            }
            if (!cancelled) {
              setFullAsset(json.asset);
            }
          }
        })
        .catch((e) => {
          if (!cancelled) {
            setAssetError((e as Error).message);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsLoadingAsset(false);
          }
        });
    }

    return () => {
      cancelled = true;
    };
  }, [r?.id]);

  // Fetch full text content for text types
  useEffect(() => {
    let cancelled = false;

    setFullText(null);
    setTextError(null);
    setIsLoadingText(false);

    if (r && r.content_type === 'text') {
      const isUUID = (id: string): boolean => {
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
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

      setIsLoadingText(true);

      // Check if this is an S3 text asset (UUID) or Git-based text asset (slug)
      if (r.id && isUUID(r.id)) {
        // S3 text asset - use media-assets API
        fetch(`/api/media-assets/${r.id}`)
          .then(async (res) => {
            if (cancelled) return;

            const json = await res.json();
            if (!res.ok || !json?.success) {
              throw new Error(json?.error || 'Failed to load S3 text asset');
            }

            if (!cancelled) {
              setFullText(json.asset?.content || '');
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
      } else {
        // Git-based text asset - use legacy API
        const slug = extractSlugFromResult(r);
        if (!slug) {
          setIsLoadingText(false);
          return;
        }

        fetch(`/api/internal/get-content/${encodeURIComponent(slug)}`)
          .then(async (res) => {
            if (cancelled) return;

            const json = await res.json();
            if (!res.ok || !json?.success) {
              throw new Error(json?.error || 'Failed to load Git text content');
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
    }

    return () => {
      cancelled = true;
    };
  }, [r?.id]);

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

  // Removed duplicate extractSlugFromResult and useEffect - moved above

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      {/* Full-width overlay that centers content */}
      <div className="absolute inset-0 flex items-start justify-center pt-8 pb-8">
        <div className="w-full max-w-4xl mx-4 bg-neutral-950 border border-neutral-800 rounded-lg shadow-xl flex flex-col max-h-full">
        {/* Fixed Header */}
        <div className="p-4 border-b border-neutral-800 flex items-center justify-between flex-shrink-0">
          <div>
            <div className="text-xs text-neutral-400">{r.content_type}</div>
            <div className="text-lg font-semibold text-neutral-100">{toDisplayText(r.title, 'Untitled')}</div>
          </div>
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded-md border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-neutral-100">
            Close
          </button>
        </div>
        {/* Scrollable Content with momentum scrolling */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 [scrollbar-width:thin] [scrollbar-color:#3f3f46_transparent]" style={{ WebkitOverflowScrolling: 'touch' }}>
          {r.content_type === 'text' ? (
            <div className="space-y-3">
              <div className="flex justify-between items-start">
                <h3 className="text-lg font-semibold text-white">{r.title}</h3>
                <ContinueConversationButton 
                  slug={r.id || r.slug || ''}
                  title={r.title}
                  contentType="text"
                  variant="outline"
                  size="sm"
                />
              </div>
              <div className="text-sm leading-6 text-neutral-200 whitespace-pre-wrap">
                {isLoadingText && <div className="text-neutral-400">Loading full text…</div>}
                {!isLoadingText && textError && <div className="text-red-400">{textError}</div>}
                {!isLoadingText && !textError && (
                  <>
                    {fullText || toDisplayText(r.preview, toDisplayText(r.description, 'No content available.'))}
                  </>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Media Display */}
              {r.content_type === 'layout' && fullAsset ? (
                <LayoutViewer layout={fullAsset.asset || fullAsset} className="w-full" />
              ) : mediaUrl && (r.content_type === 'image' ? (
                <img src={mediaUrl} alt={r.title} className="w-full rounded-lg border border-neutral-800 bg-black" />
              ) : r.content_type === 'video' ? (
                <video src={mediaUrl} controls className="w-full rounded-lg border border-neutral-800 bg-black" />
              ) : r.content_type === 'audio' ? (
                <div className="p-2 rounded-lg border border-neutral-800 bg-black"><audio src={mediaUrl} controls className="w-full" /></div>
              ) : null)}

              {/* Rich Metadata Display */}
              {isLoadingAsset && (
                <div className="text-center py-8">
                  <div className="text-neutral-400">Loading full metadata...</div>
                </div>
              )}
              {assetError && (
                <div className="text-center py-4">
                  <div className="text-red-400">Failed to load metadata: {assetError}</div>
                </div>
              )}
              {!isLoadingAsset && !assetError && (
                <MediaMetadata
                  result={r}
                  fullAsset={fullAsset}
                  onSearch={onSearch}
                />
              )}

              {/* Description intentionally omitted per latest requirements */}
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



