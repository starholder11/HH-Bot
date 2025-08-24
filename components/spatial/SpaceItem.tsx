"use client";
import { useRef, useState, useMemo, useEffect } from "react";
import { useSpaceAsset, type SpaceAssetData } from "@/hooks/useSpaceAsset";
import ObjectRenderer from "./ObjectRenderer";
import CollectionRenderer from "./CollectionRenderer";
import { type LODManager, calculateLODLevel } from "@/utils/spatial/lod";

type SpaceItemProps = {
  item: SpaceAssetData;
  cameraPosition?: [number, number, number];
  lodManager?: LODManager;
  onSelect?: (item: SpaceAssetData) => void;
  onHover?: (item: SpaceAssetData | null) => void;
  debug?: boolean;
};

export default function SpaceItem({ item, cameraPosition = [0, 0, 0], lodManager, onSelect, onHover, debug = false }: SpaceItemProps) {
  const meshRef = useRef<any>(null);
  const [hovered, setHovered] = useState(false);
  const [selected, setSelected] = useState(false);
  const [r3f, setR3F] = useState<any>(null);

  const { data: assetData, loading, error } = useSpaceAsset(item.assetId, item.assetType);

  // Load R3F components
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [fiber, drei] = await Promise.all([
          import("@react-three/fiber"),
          import("@react-three/drei"),
        ]);
        if (!mounted) return;
        setR3F({
          useFrame: fiber.useFrame,
          useLoader: fiber.useLoader,
          useTexture: drei.useTexture,
          useGLTF: drei.useGLTF,
          Text: drei.Text,
          Html: drei.Html,
        });
      } catch (err) {
        console.error("SpaceItem failed to load R3F:", err);
      }
    };
    load();
    return () => { mounted = false; };
  }, []);

  // Calculate distance for LOD
  const distance = useMemo(() => {
    if (!cameraPosition) return 10;
    const dx = item.position[0] - cameraPosition[0];
    const dy = item.position[1] - cameraPosition[1];
    const dz = item.position[2] - cameraPosition[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }, [item.position, cameraPosition]);

  // LOD quality based on distance (enhanced with LOD manager)
  const lodQuality = useMemo(() => {
    if (lodManager) {
      const lodInfo = lodManager.calculateObjectLOD(item.position, cameraPosition);
      return lodInfo.lodLevel;
    }

    // Fallback to simple distance-based LOD
    return calculateLODLevel(distance);
  }, [distance, lodManager, item.position, cameraPosition]);

  const handleClick = () => {
    setSelected(!selected);
    onSelect?.(item);
  };

  const handlePointerOver = () => {
    setHovered(true);
    onHover?.(item);
  };

  const handlePointerOut = () => {
    setHovered(false);
    onHover?.(null);
  };

  if (!item.visible) return null;
  if (!r3f) return null; // Wait for R3F to load

  const { useFrame, useTexture, useGLTF, Text, Html } = r3f;

  // Render different asset types
  const renderAssetContent = () => {
    if (loading) {
      return (
        <mesh>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="#666" wireframe />
        </mesh>
      );
    }

    if (error) {
      return (
        <mesh>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="red" />
        </mesh>
      );
    }

    switch (item.assetType) {
      case 'image':
        return <ImageAsset assetData={assetData} lodQuality={lodQuality} useTexture={useTexture} />;

      case 'video':
        return <VideoAsset assetData={assetData} lodQuality={lodQuality} useFrame={useFrame} Html={Html} />;

      case 'object':
        return (
          <ObjectRenderer
            assetData={assetData}
            showComponents={item.objectProperties?.showComponents !== false}
            interactionLevel={item.objectProperties?.interactionLevel || 'object'}
            onComponentSelect={(component) => console.log('Component selected:', component)}
            onComponentHover={(component) => console.log('Component hovered:', component)}
          />
        );

      case 'object_collection':
        return (
          <CollectionRenderer
            assetData={assetData}
            showComponents={item.objectProperties?.showComponents !== false}
            interactionLevel={item.objectProperties?.interactionLevel || 'collection'}
            useInstancing={true}
            onObjectSelect={(objectId) => console.log('Object selected:', objectId)}
            onObjectHover={(objectId) => console.log('Object hovered:', objectId)}
          />
        );

      case 'text':
        return <TextAsset assetData={assetData} Text={Text} />;

      default:
        return (
          <mesh>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="#333" />
          </mesh>
        );
    }
  };

  // Apply hover/selection effects
  const effectScale = hovered ? 1.05 : 1;
  const effectColor = selected ? "#4ade80" : hovered ? "#60a5fa" : "#ffffff";

  return (
    <group
      ref={meshRef}
      position={item.position}
      rotation={item.rotation}
      scale={[item.scale[0] * effectScale, item.scale[1] * effectScale, item.scale[2] * effectScale]}
      onClick={handleClick}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    >
      {renderAssetContent()}

      {/* Selection outline */}
      {(selected || hovered) && (
        <mesh>
          <boxGeometry args={[1.1, 1.1, 1.1]} />
          <meshBasicMaterial color={effectColor} wireframe />
        </mesh>
      )}

      {/* Debug label (disabled by default) */}
      {debug && distance < 15 && (
        <Html position={[0, 1, 0]} center>
          <div className="bg-black/60 text-white text-xs px-1 py-0.5 rounded pointer-events-none">
            {item.assetType} | {lodQuality} | {distance.toFixed(1)}m
          </div>
        </Html>
      )}
    </group>
  );
}

// Asset-specific renderers
function ImageAsset({ assetData, lodQuality, useTexture }: any) {
  if (!assetData?.cloudflare_url) return null;

  // Don't render if hidden by LOD
  if (lodQuality === 'hidden') return null;

  // Construct LOD URL
  const getImageUrl = () => {
    const baseUrl = assetData.cloudflare_url;
    switch (lodQuality) {
      case 'low': return `${baseUrl}?w=64&h=64`;
      case 'medium': return `${baseUrl}?w=256&h=256`;
      case 'high': return `${baseUrl}?w=512&h=512`;
      case 'full': return `${baseUrl}?w=1024&h=1024`;
      default: return baseUrl;
    }
  };

  try {
    const texture = useTexture(getImageUrl());
    return (
      <mesh>
        <planeGeometry args={[2, 2]} />
        <meshStandardMaterial map={texture} transparent opacity={0.9} />
      </mesh>
    );
  } catch (error) {
    return (
      <mesh>
        <planeGeometry args={[2, 2]} />
        <meshStandardMaterial color="#666" />
      </mesh>
    );
  }
}

function VideoAsset({ assetData, lodQuality, useFrame, Html }: any) {
  const meshRef = useRef<any>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoTexture, setVideoTexture] = useState<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Don't render if hidden by LOD
  if (lodQuality === 'hidden') return null;

  // Get video URL with LOD optimization
  const videoUrl = useMemo(() => {
    const baseUrl = assetData?.cloudflare_url || assetData?.s3_url;
    if (!baseUrl) return null;

    // Apply quality based on LOD - for now just use base URL
    // In production, you might want different quality levels
    return baseUrl;
  }, [assetData]);

  // Create video element and texture
  useEffect(() => {
    if (!videoUrl) return;

    const video = document.createElement('video');
    video.src = videoUrl;
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'metadata';

    const handleLoadedData = async () => {
      setIsLoaded(true);
      setDuration(video.duration || 0);

      // Dynamically import THREE to avoid SSR issues
      try {
        const THREE = await import('three');

        // Create video texture
        const texture = new THREE.VideoTexture(video);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.format = THREE.RGBAFormat;
        texture.generateMipmaps = false;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.flipY = false;

        setVideoTexture(texture);
        videoRef.current = video;

        // Auto-play for close distances
        if (lodQuality === 'full' || lodQuality === 'high') {
          try {
            await video.play();
            setIsPlaying(true);
          } catch (error) {
            console.warn('Auto-play failed:', error);
          }
        }
      } catch (error) {
        console.error('Failed to create video texture:', error);
      }
    };

    const handleError = () => {
      console.error('Video failed to load:', videoUrl);
      setIsLoaded(false);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime || 0);
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('error', handleError);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('timeupdate', handleTimeUpdate);

    return () => {
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('error', handleError);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('timeupdate', handleTimeUpdate);

      if (videoTexture) {
        videoTexture.dispose();
      }
      video.src = '';
      video.load();
    };
  }, [videoUrl, lodQuality]);

  // Update texture on each frame when playing
  useFrame(() => {
    if (videoTexture && isPlaying && videoRef.current) {
      videoTexture.needsUpdate = true;
    }
  });

  // Handle click to play/pause
  const handleClick = (event: any) => {
    event.stopPropagation();
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play().catch(console.warn);
      }
    }
  };

  // Handle seeking
  const handleSeek = (event: any) => {
    event.stopPropagation();
    if (videoRef.current && duration > 0) {
      const rect = event.target.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const percentage = x / rect.width;
      const newTime = percentage * duration;
      videoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  // Calculate aspect ratio
  const aspectRatio = useMemo(() => {
    const width = assetData?.metadata?.width || 16;
    const height = assetData?.metadata?.height || 9;
    return width / height;
  }, [assetData]);

  // Loading state
  if (!isLoaded || !videoTexture) {
    return (
      <mesh>
        <planeGeometry args={[2 * aspectRatio, 2]} />
        <meshStandardMaterial color="#333" />
        {/* Loading indicator */}
        <mesh position={[0, 0, 0.01]}>
          <ringGeometry args={[0.15, 0.2, 32]} />
          <meshBasicMaterial color="white" transparent opacity={0.6} />
        </mesh>
      </mesh>
    );
  }

  return (
    <group>
      <mesh
        ref={meshRef}
        onClick={handleClick}
        onPointerEnter={() => setShowControls(true)}
        onPointerLeave={() => setShowControls(false)}
      >
        <planeGeometry args={[2 * aspectRatio, 2]} />
        <meshBasicMaterial
          map={videoTexture}
          transparent
          opacity={0.95}
          side={2} // DoubleSide
        />
      </mesh>

      {/* Play/Pause indicator */}
      {!isPlaying && (
        <mesh position={[0, 0, 0.01]}>
          <circleGeometry args={[0.2, 32]} />
          <meshBasicMaterial color="white" transparent opacity={0.8} />
          {/* Play triangle */}
          <mesh position={[0.05, 0, 0.001]}>
            <coneGeometry args={[0.08, 0.12, 3]} />
            <meshBasicMaterial color="black" />
          </mesh>
        </mesh>
      )}

      {/* Video Controls */}
      {showControls && lodQuality !== 'low' && (
        <Html position={[0, -1.2, 0]} center>
          <div className="flex flex-col items-center gap-2 bg-black/80 rounded-lg px-4 py-2 min-w-[200px]">
            {/* Play/Pause Button */}
            <button
              onClick={handleClick}
              className="text-white hover:text-blue-400 text-lg transition-colors"
            >
              {isPlaying ? '⏸️' : '▶️'}
            </button>

            {/* Progress Bar */}
            {duration > 0 && (
              <div className="w-full">
                <div
                  className="w-full h-2 bg-gray-600 rounded cursor-pointer"
                  onClick={handleSeek}
                >
                  <div
                    className="h-full bg-blue-500 rounded transition-all"
                    style={{ width: `${(currentTime / duration) * 100}%` }}
                  />
                </div>
                <div className="text-white text-xs mt-1 text-center">
                  {Math.floor(currentTime)}s / {Math.floor(duration)}s
                </div>
              </div>
            )}
          </div>
        </Html>
      )}
    </group>
  );
}



function TextAsset({ assetData, Text }: any) {
  const content = assetData?.content || assetData?.title || "Text Asset";

  return (
    <Text
      fontSize={0.5}
      color="#ffffff"
      anchorX="center"
      anchorY="middle"
    >
      {content}
    </Text>
  );
}
