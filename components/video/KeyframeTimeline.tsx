'use client';

import React from 'react';

interface KeyframeStill {
  id: string;
  parent_video_id: string;
  timestamp: string;
  frame_number: number;
  s3_url: string;
  cloudflare_url: string;
  reusable_as_image: boolean;
  metadata: {
    quality: number;
    resolution: { width: number; height: number };
  };
  ai_labels?: {
    scenes: string[];
    objects: string[];
    style: string[];
    mood: string[];
    themes: string[];
  };
  usage_tracking: {
    times_reused: number;
    projects_used_in: string[];
  };
}

interface KeyframeTimelineProps {
  keyframes: KeyframeStill[];
  onKeyframeClick: (keyframe: KeyframeStill) => void;
  className?: string;
}

export function KeyframeTimeline({
  keyframes,
  onKeyframeClick,
  className = ''
}: KeyframeTimelineProps) {
  if (!keyframes || keyframes.length === 0) {
    return (
      <div className={`text-center text-gray-500 py-8 ${className}`}>
        <div className="text-4xl mb-2">🎬</div>
        <p>No keyframes available</p>
        <p className="text-sm mt-1">Analyze the video to extract keyframes</p>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">
          Keyframe Timeline ({keyframes.length} frames)
        </h3>
        <div className="text-sm text-gray-500">
          Click any keyframe to view details and conversion options
        </div>
      </div>

      {/* Keyframe Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {keyframes.map((keyframe) => (
          <KeyframeCard
            key={keyframe.id}
            keyframe={keyframe}
            onClick={() => onKeyframeClick(keyframe)}
          />
        ))}
      </div>

      {/* Keyframe Statistics */}
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-lg font-semibold text-gray-900">{keyframes.length}</div>
            <div className="text-sm text-gray-600">Total Frames</div>
          </div>
          <div>
            <div className="text-lg font-semibold text-green-600">
              {keyframes.filter(k => k.reusable_as_image).length}
            </div>
            <div className="text-sm text-gray-600">Reusable</div>
          </div>
          <div>
            <div className="text-lg font-semibold text-blue-600">
              {keyframes.reduce((sum, k) => sum + k.usage_tracking.times_reused, 0)}
            </div>
            <div className="text-sm text-gray-600">Total Reuses</div>
          </div>
          <div>
            <div className="text-lg font-semibold text-purple-600">
              {Math.round(keyframes.reduce((sum, k) => sum + k.metadata.quality, 0) / keyframes.length)}
            </div>
            <div className="text-sm text-gray-600">Avg Quality</div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface KeyframeCardProps {
  keyframe: KeyframeStill;
  onClick: () => void;
}

function KeyframeCard({ keyframe, onClick }: KeyframeCardProps) {
  const qualityColor = keyframe.metadata.quality >= 80
    ? 'text-green-600'
    : keyframe.metadata.quality >= 60
    ? 'text-yellow-600'
    : 'text-red-600';

  return (
    <div
      className="cursor-pointer group transform transition-all duration-200 hover:scale-105"
      onClick={onClick}
    >
      <div className="relative">
        {/* Keyframe Image */}
        <img
          src={keyframe.cloudflare_url}
          alt={`Keyframe at ${keyframe.timestamp}`}
          className="w-full aspect-video object-cover rounded-lg shadow-md group-hover:shadow-lg transition-shadow"
          loading="lazy"
        />

        {/* Timestamp Overlay */}
        <div className="absolute bottom-1 right-1 bg-black bg-opacity-75 text-white text-xs px-1.5 py-0.5 rounded">
          {keyframe.timestamp}
        </div>

        {/* Reusable Badge */}
        {keyframe.reusable_as_image && (
          <div className="absolute top-1 right-1 bg-green-500 text-white text-xs px-1.5 py-0.5 rounded">
            Reusable
          </div>
        )}

        {/* Quality Badge */}
        <div className="absolute top-1 left-1 bg-white bg-opacity-90 text-xs px-1.5 py-0.5 rounded">
          <span className={qualityColor}>{keyframe.metadata.quality}</span>
        </div>

        {/* Usage Indicator */}
        {keyframe.usage_tracking.times_reused > 0 && (
          <div className="absolute bottom-1 left-1 bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded">
            ↻ {keyframe.usage_tracking.times_reused}
          </div>
        )}
      </div>

      {/* Metadata */}
      <div className="mt-2 space-y-1">
        <div className="text-xs text-gray-600 flex justify-between">
          <span>Frame #{keyframe.frame_number}</span>
          <span>{keyframe.metadata.resolution.width}×{keyframe.metadata.resolution.height}</span>
        </div>

        {/* AI Labels Preview */}
        {keyframe.ai_labels && keyframe.ai_labels.objects.length > 0 && (
          <div className="text-xs text-gray-500 truncate">
            {keyframe.ai_labels.objects.slice(0, 3).join(', ')}
            {keyframe.ai_labels.objects.length > 3 && '...'}
          </div>
        )}
      </div>
    </div>
  );
}
