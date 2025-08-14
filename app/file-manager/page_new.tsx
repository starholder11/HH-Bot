'use client';

import { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/Card';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { Image, Video, Music, FileText } from 'lucide-react';
import { Project as ProjectType } from '@/lib/project-storage';
import MediaThumbnail from '@/components/MediaThumbnail';

interface MediaAsset {
  id: string;
  filename: string;
  s3_url: string;
  cloudflare_url: string;
  title: string;
  media_type: 'image' | 'video' | 'audio' | 'keyframe_still';
  metadata: any;
  ai_labels: {
    scenes: string[];
    objects: string[];
    style: string[];
    mood: string[];
    themes: string[];
    confidence_scores: Record<string, number[]>;
  };
  manual_labels: {
    scenes: string[];
    objects: string[];
    style: string[];
    mood: string[];
    themes: string[];
    custom_tags: string[];
    // Audio-specific fields
    custom_styles?: string[];
    custom_moods?: string[];
    custom_themes?: string[];
    primary_genre?: string;
    energy_level?: number;
    emotional_intensity?: number;
    tempo?: number;
    vocals?: string;
    language?: string;
    explicit?: boolean;
    instrumental?: boolean;
  };
  processing_status: {
    upload: 'pending' | 'completed' | 'error';
    metadata_extraction: 'pending' | 'completed' | 'error';
    ai_labeling: 'not_started' | 'triggering' | 'processing' | 'pending' | 'completed' | 'failed' | 'error';
    manual_review: 'pending' | 'completed' | 'error';
  };
  timestamps: {
    uploaded: string;
    metadata_extracted: string | null;
    labeled_ai: string | null;
    labeled_reviewed: string | null;
  };
  labeling_complete: boolean;
  project_id: string | null;
  created_at: string;
  updated_at: string;
  // Audio-specific fields
  lyrics?: string;
  prompt?: string;
  cover_art?: {
    s3_url: string;
    cloudflare_url: string;
    key: string;
  };
  // Keyframe-specific metadata (when image is from video keyframe)
  _keyframe_metadata?: {
    parent_video_id: string;
    timestamp: string;
    frame_number: number;
    source_video: string;
  };
}

interface Project {
  project_id: string;  // Changed from id to project_id to match API
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  asset_counts: {
    total: number;
    images: number;
    videos: number;
    audios: number;
  };
}

const MEDIA_TYPES = ['image', 'video', 'audio'] as const;

function encodePath(url: string) {
  try {
    const u = new URL(url);
    if (/%[0-9A-Fa-f]{2}/.test(u.pathname)) {
      return u.toString();
    }
    u.pathname = u.pathname
      .split('/')
      .map(part => encodeURIComponent(part))
      .join('/');
    return u.toString();
  } catch {
    return url;
  }
}

const AssetListItem = memo(function AssetListItem({
  asset,
  isSelected,
  onSelect,
  getAssetIcon,
  getAssetDisplayInfo
}: {
  asset: MediaAsset;
  isSelected: boolean;
  onSelect: (asset: MediaAsset) => void;
  getAssetIcon: (asset: MediaAsset) => React.ReactElement;
  getAssetDisplayInfo: (asset: MediaAsset) => { primaryLabel: string; secondaryInfo: string };
}) {
  const displayInfo = getAssetDisplayInfo(asset);

  return (
    <div
      onClick={() => onSelect(asset)}
      className={`p-3 border rounded-lg cursor-pointer transition-all duration-200 ${
        isSelected
          ? 'bg-blue-900/50 border-blue-600 shadow-md'
          : 'bg-neutral-900 border-neutral-700 hover:bg-neutral-800 hover:border-neutral-600'
      }`}
    >
      <div className="flex justify-between items-start">
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2">
            <span className="text-sm">{getAssetIcon(asset)}</span>
            <div className="text-sm font-medium truncate text-white">{asset.title}</div>
          </div>
          <div className="text-xs text-neutral-400 truncate">{asset.filename}</div>
          <div className="text-xs text-blue-400 mt-1">
            {displayInfo.primaryLabel}
          </div>
          <div className="text-xs text-neutral-500 mt-1">
            {displayInfo.secondaryInfo}
          </div>
          {asset.manual_labels?.mood?.length > 0 && (
            <div className="text-xs text-purple-400 mt-1">
              {(asset.manual_labels?.mood || []).slice(0, 2).join(', ')}
              {(asset.manual_labels?.mood || []).length > 2 && '...'}
            </div>
          )}
        </div>
        <div className="ml-2 flex flex-col items-end space-y-1">
          {asset.labeling_complete && (
            <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">✓</span>
          )}
          {asset.cover_art && (
            <span className="text-xs text-gray-400">🖼️</span>
          )}
        </div>
      </div>
    </div>
  );
});

// Helper function to get asset type icon
const getAssetIcon = (asset: MediaAsset) => {
  switch (asset.media_type) {
    case 'image':
      return <Image className="w-5 h-5 text-neutral-400" />;
    case 'keyframe_still':
      return (
        <span className="flex items-center space-x-0.5">
          <Video className="w-4 h-4 text-neutral-400" />
          <Image className="w-4 h-4 text-neutral-400" />
        </span>
      );
    case 'video':
      return <Video className="w-5 h-5 text-neutral-400" />;
    case 'audio':
      return <Music className="w-5 h-5 text-neutral-400" />;
    default:
      return <FileText className="w-5 h-5 text-neutral-400" />;
  }
};

export default function FileManagerPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="container mx-auto p-6">
        <h1 className="text-3xl font-light tracking-tight text-white">Media Library</h1>
        <div className="text-center py-8">
          <p className="text-neutral-400 mb-4">Test component</p>
        </div>
      </div>
    </div>
  );
}
