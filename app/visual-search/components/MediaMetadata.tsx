"use client";
import React from 'react';
import type { UnifiedSearchResult } from '../types';

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

interface MediaMetadataProps {
  result: UnifiedSearchResult;
  fullAsset?: any; // Complete asset data from S3
  onSearch?: (query: string) => void;
}

export default function MediaMetadata({ result: r, fullAsset, onSearch }: MediaMetadataProps) {
  // Use full asset data if available, otherwise fall back to search result metadata
  const m: any = fullAsset || r.metadata || {};
  
  // Debug: Log the actual metadata structure
  console.log('MediaMetadata received:', { 
    id: r.id, 
    content_type: r.content_type, 
    hasFullAsset: !!fullAsset,
    metadata: m 
  });

  const pick = (...keys: Array<string>): any => {
    for (const k of keys) {
      const parts = k.split('.');
      let cur: any = m;
      let ok = true;
      for (const p of parts) {
        if (cur && typeof cur === 'object' && p in cur) cur = cur[p];
        else { ok = false; break; }
      }
      if (ok && cur != null) return cur;
    }
    return undefined;
  };

  // Extract technical metadata with correct field paths
  const meta = {
    width: m.width ?? m.metadata?.width ?? pick('metadata.width', 'metadata.resolution.width'),
    height: m.height ?? m.metadata?.height ?? pick('metadata.height', 'metadata.resolution.height'),
    duration: m.duration ?? m.metadata?.duration ?? pick('metadata.duration'),
    format: m.format ?? m.metadata?.format ?? m.file_type,
    fileSize: m.file_size ?? m.metadata?.file_size ?? pick('metadata.file_size'),
    aspectRatio: m.aspect_ratio ?? m.metadata?.aspect_ratio ?? pick('metadata.aspect_ratio'),
    bitrate: m.bitrate ?? m.metadata?.bitrate ?? pick('metadata.bitrate'),
    artist: m.artist ?? m.metadata?.artist ?? pick('metadata.artist'),
  } as const;

  // Helper to create clickable labels
  const createClickableLabel = (text: string, className: string, searchQuery?: string) => {
    const handleClick = () => {
      if (onSearch && searchQuery) {
        onSearch(searchQuery);
      }
    };

    return (
      <span 
        key={text} 
        className={`${className} ${onSearch ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
        onClick={handleClick}
        title={onSearch ? `Search for "${searchQuery || text}"` : undefined}
      >
        {text}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* Technical Metadata */}
      <div>
        <h3 className="text-lg font-semibold text-neutral-200 mb-3">
          {r.content_type === 'image' ? 'Image Details' : 
           r.content_type === 'video' ? 'Video Details' : 
           'Audio Details'}
        </h3>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Dimensions for images/videos */}
          {(r.content_type === 'image' || r.content_type === 'video') && meta.width && meta.height && (
            <div className="text-center p-3 bg-neutral-800 rounded-lg">
              <div className="text-xs text-neutral-400 font-medium">Dimensions</div>
              <div className="text-sm font-bold text-neutral-100 mt-1">
                {meta.width}×{meta.height}
              </div>
            </div>
          )}
          
          {/* Duration for video/audio */}
          {(r.content_type === 'video' || r.content_type === 'audio') && meta.duration && (
            <div className="text-center p-3 bg-neutral-800 rounded-lg">
              <div className="text-xs text-neutral-400 font-medium">Duration</div>
              <div className="text-sm font-bold text-neutral-100 mt-1">
                {Math.floor(Number(meta.duration) / 60)}:{String(Math.floor(Number(meta.duration) % 60)).padStart(2, '0')}
              </div>
            </div>
          )}
          
          {/* Format */}
          {meta.format && (
            <div className="text-center p-3 bg-neutral-800 rounded-lg">
              <div className="text-xs text-neutral-400 font-medium">Format</div>
              <div className="text-sm font-bold text-neutral-100 mt-1">
                {String(meta.format).toUpperCase()}
              </div>
            </div>
          )}
          
          {/* File Size */}
          {meta.fileSize && (
            <div className="text-center p-3 bg-neutral-800 rounded-lg">
              <div className="text-xs text-neutral-400 font-medium">File Size</div>
              <div className="text-sm font-bold text-neutral-100 mt-1">
                {Number(meta.fileSize) > 1024 * 1024 
                  ? `${(Number(meta.fileSize) / (1024 * 1024)).toFixed(1)} MB`
                  : `${Math.round(Number(meta.fileSize) / 1024)} KB`}
              </div>
            </div>
          )}

          {/* Aspect Ratio for images/videos */}
          {(r.content_type === 'image' || r.content_type === 'video') && meta.aspectRatio && (
            <div className="text-center p-3 bg-neutral-800 rounded-lg">
              <div className="text-xs text-neutral-400 font-medium">Ratio</div>
              <div className="text-sm font-bold text-neutral-100 mt-1">
                {meta.aspectRatio}
              </div>
            </div>
          )}

          {/* Audio-specific metadata */}
          {r.content_type === 'audio' && meta.bitrate && (
            <div className="text-center p-3 bg-neutral-800 rounded-lg">
              <div className="text-xs text-neutral-400 font-medium">Bitrate</div>
              <div className="text-sm font-bold text-neutral-100 mt-1">
                {meta.bitrate}
              </div>
            </div>
          )}

          {r.content_type === 'audio' && meta.artist && (
            <div className="text-center p-3 bg-neutral-800 rounded-lg">
              <div className="text-xs text-neutral-400 font-medium">Artist</div>
              <div className="text-sm font-bold text-neutral-100 mt-1">
                {toDisplayText(meta.artist, 'Unknown')}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* AI Labels - check metadata.ai_labels (from parsed references) */}
      {m.ai_labels && (() => {
        const aiLabels = m.ai_labels;
        return (
        <div>
          <h3 className="text-lg font-semibold text-neutral-200 mb-3">AI Analysis</h3>
          
          {/* Scene Description */}
          {aiLabels.scenes?.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-semibold text-neutral-300 mb-2">Scene Description</h4>
              <div className="bg-purple-950/40 border-l-4 border-purple-400 p-4 rounded-r-lg">
                <p className="text-neutral-200 leading-relaxed text-sm">
                  {aiLabels.scenes[0]}
                </p>
              </div>
            </div>
          )}

          {/* Label Categories */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {aiLabels.objects?.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-neutral-300 mb-2">Objects</h4>
                <div className="flex flex-wrap gap-1">
                  {aiLabels.objects.slice(0, 8).map((object: string, index: number) => 
                    createClickableLabel(
                      object,
                      "px-3 py-1 text-xs bg-blue-900/40 text-blue-300 rounded-full border border-blue-800",
                      object
                    )
                  )}
                  {aiLabels.objects.length > 8 && (
                    <span className="px-3 py-1 text-xs bg-neutral-800 text-neutral-400 rounded-full">
                      +{aiLabels.objects.length - 8} more
                    </span>
                  )}
                </div>
              </div>
            )}

            {aiLabels.style?.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-neutral-300 mb-2">Style</h4>
                <div className="flex flex-wrap gap-1">
                  {aiLabels.style.map((style: string, index: number) => 
                    createClickableLabel(
                      style,
                      "px-3 py-1 text-xs bg-green-900/40 text-green-300 rounded-full border border-green-800",
                      style
                    )
                  )}
                </div>
              </div>
            )}

            {aiLabels.mood?.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-neutral-300 mb-2">Mood</h4>
                <div className="flex flex-wrap gap-1">
                  {aiLabels.mood.map((mood: string, index: number) => 
                    createClickableLabel(
                      mood,
                      "px-3 py-1 text-xs bg-yellow-900/40 text-yellow-300 rounded-full border border-yellow-800",
                      mood
                    )
                  )}
                </div>
              </div>
            )}

            {aiLabels.themes?.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-neutral-300 mb-2">Themes</h4>
                <div className="flex flex-wrap gap-1">
                  {aiLabels.themes.map((theme: string, index: number) => 
                    createClickableLabel(
                      theme,
                      "px-3 py-1 text-xs bg-orange-900/40 text-orange-300 rounded-full border border-orange-800",
                      theme
                    )
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        );
      })()}

      {/* Manual Labels */}
      {m.manual_labels && (
        <div>
          <h3 className="text-lg font-semibold text-neutral-200 mb-3">Manual Labels</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {m.manual_labels.custom_tags?.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-neutral-300 mb-2">Custom Tags</h4>
                <div className="flex flex-wrap gap-1">
                  {m.manual_labels.custom_tags.map((tag: string, index: number) => 
                    createClickableLabel(
                      tag,
                      "px-3 py-1 text-xs bg-neutral-700 text-neutral-200 rounded-full border border-neutral-600",
                      tag
                    )
                  )}
                </div>
              </div>
            )}

            {/* Audio-specific manual labels */}
            {r.content_type === 'audio' && m.manual_labels.primary_genre && (
              <div>
                <h4 className="text-sm font-semibold text-neutral-300 mb-2">Genre</h4>
                {createClickableLabel(
                  m.manual_labels.primary_genre,
                  "px-3 py-1 text-xs bg-purple-900/40 text-purple-300 rounded-full border border-purple-800",
                  m.manual_labels.primary_genre
                )}
              </div>
            )}
          </div>

          {/* Audio-specific metrics */}
          {r.content_type === 'audio' && m.manual_labels && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
              {typeof m.manual_labels?.energy_level === 'number' && (
                <div className="text-center p-3 bg-neutral-800 rounded-lg">
                  <div className="text-xs text-neutral-400 font-medium">Energy</div>
                  <div className="text-sm font-bold text-neutral-100 mt-1">
                    {m.manual_labels.energy_level}/10
                  </div>
                </div>
              )}
              
              {typeof m.manual_labels?.emotional_intensity === 'number' && (
                <div className="text-center p-3 bg-neutral-800 rounded-lg">
                  <div className="text-xs text-neutral-400 font-medium">Intensity</div>
                  <div className="text-sm font-bold text-neutral-100 mt-1">
                    {m.manual_labels.emotional_intensity}/10
                  </div>
                </div>
              )}
              
              {typeof m.manual_labels?.tempo === 'number' && (
                <div className="text-center p-3 bg-neutral-800 rounded-lg">
                  <div className="text-xs text-neutral-400 font-medium">Tempo</div>
                  <div className="text-sm font-bold text-neutral-100 mt-1">
                    {m.manual_labels.tempo} BPM
                  </div>
                </div>
              )}

              {m.manual_labels?.vocals && (
                <div className="text-center p-3 bg-neutral-800 rounded-lg">
                  <div className="text-xs text-neutral-400 font-medium">Vocals</div>
                  <div className="text-sm font-bold text-neutral-100 mt-1">
                    {toDisplayText(m.manual_labels.vocals)}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Lyrics for audio - full height, no scroll constraint */}
      {r.content_type === 'audio' && (m.lyrics || m.manual_labels?.lyrics) && (
        <div>
          <h3 className="text-lg font-semibold text-neutral-200 mb-3">Lyrics</h3>
          <div className="text-sm text-neutral-300 bg-blue-950/40 p-6 rounded-lg border-l-4 border-blue-400 whitespace-pre-wrap leading-relaxed">
            {toDisplayText(m.lyrics || m.manual_labels?.lyrics)}
          </div>
        </div>
      )}
    </div>
  );
}
