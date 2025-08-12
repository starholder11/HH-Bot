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
}

export default function MediaMetadata({ result: r }: MediaMetadataProps) {
  if (!r.metadata) return null;

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
          {(r.content_type === 'image' || r.content_type === 'video') && r.metadata.width && r.metadata.height && (
            <div className="text-center p-3 bg-neutral-800 rounded-lg">
              <div className="text-xs text-neutral-400 font-medium">Dimensions</div>
              <div className="text-sm font-bold text-neutral-100 mt-1">
                {r.metadata.width}×{r.metadata.height}
              </div>
            </div>
          )}
          
          {/* Duration for video/audio */}
          {(r.content_type === 'video' || r.content_type === 'audio') && r.metadata.duration && (
            <div className="text-center p-3 bg-neutral-800 rounded-lg">
              <div className="text-xs text-neutral-400 font-medium">Duration</div>
              <div className="text-sm font-bold text-neutral-100 mt-1">
                {Math.floor(r.metadata.duration / 60)}:{String(Math.floor(r.metadata.duration % 60)).padStart(2, '0')}
              </div>
            </div>
          )}
          
          {/* Format */}
          {r.metadata.format && (
            <div className="text-center p-3 bg-neutral-800 rounded-lg">
              <div className="text-xs text-neutral-400 font-medium">Format</div>
              <div className="text-sm font-bold text-neutral-100 mt-1">
                {r.metadata.format.toString().toUpperCase()}
              </div>
            </div>
          )}
          
          {/* File Size */}
          {r.metadata.file_size && (
            <div className="text-center p-3 bg-neutral-800 rounded-lg">
              <div className="text-xs text-neutral-400 font-medium">File Size</div>
              <div className="text-sm font-bold text-neutral-100 mt-1">
                {r.metadata.file_size > 1024 * 1024 
                  ? `${(r.metadata.file_size / (1024 * 1024)).toFixed(1)} MB`
                  : `${Math.round(r.metadata.file_size / 1024)} KB`}
              </div>
            </div>
          )}

          {/* Aspect Ratio for images/videos */}
          {(r.content_type === 'image' || r.content_type === 'video') && r.metadata.aspect_ratio && (
            <div className="text-center p-3 bg-neutral-800 rounded-lg">
              <div className="text-xs text-neutral-400 font-medium">Ratio</div>
              <div className="text-sm font-bold text-neutral-100 mt-1">
                {r.metadata.aspect_ratio}
              </div>
            </div>
          )}

          {/* Audio-specific metadata */}
          {r.content_type === 'audio' && r.metadata.bitrate && (
            <div className="text-center p-3 bg-neutral-800 rounded-lg">
              <div className="text-xs text-neutral-400 font-medium">Bitrate</div>
              <div className="text-sm font-bold text-neutral-100 mt-1">
                {r.metadata.bitrate}
              </div>
            </div>
          )}

          {r.content_type === 'audio' && r.metadata.artist && (
            <div className="text-center p-3 bg-neutral-800 rounded-lg">
              <div className="text-xs text-neutral-400 font-medium">Artist</div>
              <div className="text-sm font-bold text-neutral-100 mt-1">
                {toDisplayText(r.metadata.artist, 'Unknown')}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* AI Labels - check both metadata.ai_labels and direct ai_labels */}
      {(r.metadata?.ai_labels || (r as any).ai_labels) && (() => {
        const aiLabels = r.metadata?.ai_labels || (r as any).ai_labels;
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
                  {aiLabels.objects.slice(0, 8).map((object: string, index: number) => (
                    <span key={index} className="px-3 py-1 text-xs bg-blue-900/40 text-blue-300 rounded-full border border-blue-800">
                      {object}
                    </span>
                  ))}
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
                  {aiLabels.style.map((style: string, index: number) => (
                    <span key={index} className="px-3 py-1 text-xs bg-green-900/40 text-green-300 rounded-full border border-green-800">
                      {style}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {aiLabels.mood?.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-neutral-300 mb-2">Mood</h4>
                <div className="flex flex-wrap gap-1">
                  {aiLabels.mood.map((mood: string, index: number) => (
                    <span key={index} className="px-3 py-1 text-xs bg-yellow-900/40 text-yellow-300 rounded-full border border-yellow-800">
                      {mood}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {aiLabels.themes?.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-neutral-300 mb-2">Themes</h4>
                <div className="flex flex-wrap gap-1">
                  {aiLabels.themes.map((theme: string, index: number) => (
                    <span key={index} className="px-3 py-1 text-xs bg-orange-900/40 text-orange-300 rounded-full border border-orange-800">
                      {theme}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        );
      })()}

      {/* Manual Labels */}
      {r.metadata.manual_labels && (
        <div>
          <h3 className="text-lg font-semibold text-neutral-200 mb-3">Manual Labels</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {r.metadata.manual_labels.custom_tags?.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-neutral-300 mb-2">Custom Tags</h4>
                <div className="flex flex-wrap gap-1">
                  {r.metadata.manual_labels.custom_tags.map((tag: string, index: number) => (
                    <span key={index} className="px-3 py-1 text-xs bg-neutral-700 text-neutral-200 rounded-full border border-neutral-600">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Audio-specific manual labels */}
            {r.content_type === 'audio' && r.metadata.manual_labels.primary_genre && (
              <div>
                <h4 className="text-sm font-semibold text-neutral-300 mb-2">Genre</h4>
                <span className="px-3 py-1 text-xs bg-purple-900/40 text-purple-300 rounded-full border border-purple-800">
                  {r.metadata.manual_labels.primary_genre}
                </span>
              </div>
            )}
          </div>

          {/* Audio-specific metrics */}
          {r.content_type === 'audio' && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
              {typeof r.metadata.manual_labels.energy_level === 'number' && (
                <div className="text-center p-3 bg-neutral-800 rounded-lg">
                  <div className="text-xs text-neutral-400 font-medium">Energy</div>
                  <div className="text-sm font-bold text-neutral-100 mt-1">
                    {r.metadata.manual_labels.energy_level}/10
                  </div>
                </div>
              )}
              
              {typeof r.metadata.manual_labels.emotional_intensity === 'number' && (
                <div className="text-center p-3 bg-neutral-800 rounded-lg">
                  <div className="text-xs text-neutral-400 font-medium">Intensity</div>
                  <div className="text-sm font-bold text-neutral-100 mt-1">
                    {r.metadata.manual_labels.emotional_intensity}/10
                  </div>
                </div>
              )}
              
              {typeof r.metadata.manual_labels.tempo === 'number' && (
                <div className="text-center p-3 bg-neutral-800 rounded-lg">
                  <div className="text-xs text-neutral-400 font-medium">Tempo</div>
                  <div className="text-sm font-bold text-neutral-100 mt-1">
                    {r.metadata.manual_labels.tempo} BPM
                  </div>
                </div>
              )}

              {r.metadata.manual_labels.vocals && (
                <div className="text-center p-3 bg-neutral-800 rounded-lg">
                  <div className="text-xs text-neutral-400 font-medium">Vocals</div>
                  <div className="text-sm font-bold text-neutral-100 mt-1">
                    {toDisplayText(r.metadata.manual_labels.vocals)}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Lyrics for audio */}
      {r.content_type === 'audio' && (r.metadata.lyrics || (r as any).lyrics) && (
        <div>
          <h3 className="text-lg font-semibold text-neutral-200 mb-2">Lyrics</h3>
          <div className="text-sm text-neutral-300 bg-blue-950/40 p-4 rounded-lg border-l-4 border-blue-400 max-h-32 overflow-y-auto whitespace-pre-wrap">
            {toDisplayText(r.metadata.lyrics || (r as any).lyrics)}
          </div>
        </div>
      )}
    </div>
  );
}
