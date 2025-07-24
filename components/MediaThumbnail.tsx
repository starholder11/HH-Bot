'use client';

import { useState, useRef, useCallback } from 'react';
import { Play, Pause, Music, Video as VideoIcon, Maximize2 } from 'lucide-react';

interface MediaThumbnailProps {
  asset: {
    id: string;
    media_type: 'image' | 'video' | 'audio' | 'keyframe_still';
    cloudflare_url?: string;
    s3_url: string;
    title: string;
    metadata?: any;
  };
  className?: string;
  onDoubleClick?: () => void;
}

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

export default function MediaThumbnail({ asset, className = '', onDoubleClick }: MediaThumbnailProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [hasError, setHasError] = useState(false);
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement>(null);
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const clickCountRef = useRef(0);

  const handleMediaClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    clickCountRef.current += 1;

    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
    }

    clickTimeoutRef.current = setTimeout(() => {
      if (clickCountRef.current === 1) {
        // Single click - play/pause
        if (mediaRef.current) {
          if (isPlaying) {
            mediaRef.current.pause();
            setIsPlaying(false);
          } else {
            mediaRef.current.play().then(() => {
              setIsPlaying(true);
            }).catch((error) => {
              console.error('Error playing media:', error);
              setHasError(true);
            });
          }
        }
      } else if (clickCountRef.current === 2) {
        // Double click - open editor
        if (onDoubleClick) {
          onDoubleClick();
        }
      }
      clickCountRef.current = 0;
    }, 250);
  }, [isPlaying, onDoubleClick]);

  const handleMediaEnd = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const handleMediaError = useCallback(() => {
    setHasError(true);
    setIsPlaying(false);
  }, []);

  // For images and keyframes, show the image
  if (asset.media_type === 'image' || asset.media_type === 'keyframe_still') {
    const imageUrl = asset.cloudflare_url || asset.s3_url;
    return (
      <div
        className={`relative ${className}`}
        onDoubleClick={onDoubleClick}
      >
        <img
          src={encodePath(imageUrl)}
          alt={asset.title}
          className="w-full h-full object-cover rounded"
          onError={(e) => {
            console.error('Image failed to load:', imageUrl);
            e.currentTarget.style.display = 'none';
            const parent = e.currentTarget.parentElement;
            if (parent) {
              parent.innerHTML = '<div class="flex items-center justify-center text-gray-500 w-full h-full bg-gray-100 rounded"><svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg></div>';
            }
          }}
        />
      </div>
    );
  }

  // For video assets
  if (asset.media_type === 'video') {
    const videoUrl = asset.cloudflare_url || asset.s3_url;
    return (
      <div
        className={`relative ${className} bg-black rounded overflow-hidden group cursor-pointer`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={handleMediaClick}
      >
        <video
          ref={mediaRef as React.RefObject<HTMLVideoElement>}
          className="w-full h-full object-cover"
          onEnded={handleMediaEnd}
          onError={handleMediaError}
          muted
          preload="metadata"
        >
          <source src={encodePath(videoUrl)} />
          Your browser does not support the video tag.
        </video>

        {/* Play/Pause Overlay */}
        <div className={`absolute inset-0 flex items-center justify-center bg-black bg-opacity-30 transition-opacity ${
          isHovered || !isPlaying ? 'opacity-100' : 'opacity-0'
        }`}>
          {!hasError ? (
            <div className="bg-white bg-opacity-80 rounded-full p-2">
              {isPlaying ? (
                <Pause className="text-black" size={24} />
              ) : (
                <Play className="text-black" size={24} />
              )}
            </div>
          ) : (
            <div className="bg-red-500 bg-opacity-80 rounded-full p-2">
              <VideoIcon className="text-white" size={24} />
            </div>
          )}
        </div>

        {/* Editor Button */}
        {isHovered && (
          <button
            className="absolute top-2 right-2 bg-black bg-opacity-60 text-white rounded p-1 hover:bg-opacity-80"
            onClick={(e) => {
              e.stopPropagation();
              if (onDoubleClick) onDoubleClick();
            }}
          >
            <Maximize2 size={16} />
          </button>
        )}
      </div>
    );
  }

  // For audio assets
  if (asset.media_type === 'audio') {
    const audioUrl = asset.cloudflare_url || asset.s3_url;
    return (
      <div
        className={`relative ${className} bg-gradient-to-br from-purple-500 to-pink-500 rounded overflow-hidden group cursor-pointer`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={handleMediaClick}
      >
        <audio
          ref={mediaRef as React.RefObject<HTMLAudioElement>}
          onEnded={handleMediaEnd}
          onError={handleMediaError}
          preload="metadata"
        >
          <source src={encodePath(audioUrl)} />
          Your browser does not support the audio tag.
        </audio>

        {/* Background Pattern */}
        <div className="absolute inset-0 flex items-center justify-center">
          <Music className="text-white opacity-20" size={48} />
        </div>

        {/* Play/Pause Overlay */}
        <div className={`absolute inset-0 flex items-center justify-center transition-opacity ${
          isHovered || isPlaying ? 'opacity-100' : 'opacity-70'
        }`}>
          {!hasError ? (
            <div className="bg-white bg-opacity-90 rounded-full p-3">
              {isPlaying ? (
                <Pause className="text-purple-600" size={24} />
              ) : (
                <Play className="text-purple-600" size={24} />
              )}
            </div>
          ) : (
            <div className="bg-red-500 bg-opacity-80 rounded-full p-3">
              <Music className="text-white" size={24} />
            </div>
          )}
        </div>

        {/* Title */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-2">
          <p className="text-white text-xs truncate">{asset.title}</p>
        </div>

        {/* Editor Button */}
        {isHovered && (
          <button
            className="absolute top-2 right-2 bg-black bg-opacity-60 text-white rounded p-1 hover:bg-opacity-80"
            onClick={(e) => {
              e.stopPropagation();
              if (onDoubleClick) onDoubleClick();
            }}
          >
            <Maximize2 size={16} />
          </button>
        )}
      </div>
    );
  }

  // Fallback for unknown media types
  return (
    <div className={`${className} bg-gray-100 rounded flex items-center justify-center`}>
      <VideoIcon className="text-gray-400" size={24} />
    </div>
  );
}
