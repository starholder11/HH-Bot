"use client";
import { useState, useEffect, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Environment, StatsGl } from '@react-three/drei';
import * as THREE from 'three';
import { convertSpaceToThreeJSScene } from '@/lib/spatial/scene-conversion';
import ThreeSceneR3F from './ThreeSceneR3F';
import DetailsOverlay from '@/app/visual-search/components/DetailsOverlay';

export interface PublicSpaceViewerProps {
  spaceData: any;
  spaceId: string;
}

export default function PublicSpaceViewer({ spaceData, spaceId }: PublicSpaceViewerProps) {
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [sceneChildren, setSceneChildren] = useState<any[]>([]);
  const [cameraPosition, setCameraPosition] = useState<[number, number, number]>([10, 10, 10]);
  const [cameraFov, setCameraFov] = useState<number>(60);
  const [cameraTarget, setCameraTarget] = useState<[number, number, number] | null>(null);
  const [cameraQuaternion, setCameraQuaternion] = useState<[number, number, number, number] | null>(null);

  // Modal state for asset details
  const [selectedAsset, setSelectedAsset] = useState<any>(null);
  const [isLoadingAsset, setIsLoadingAsset] = useState(false);

  // Build scene JSON using the EXACT same conversion as SpaceEditor, then render via R3F
  useEffect(() => {
    if (!spaceData) return;
    try {
      const threeJSScene = convertSpaceToThreeJSScene(spaceData);
      const children = threeJSScene?.object?.children || [];
      setSceneChildren(children);

      // Set camera pose from saved scene data
      console.log('[Public Viewer] threeJSScene.userData:', threeJSScene?.userData);
      const savedCameraPos = threeJSScene?.userData?.camera?.position;
      console.log('[Public Viewer] savedCameraPos:', savedCameraPos);
      if (savedCameraPos && Array.isArray(savedCameraPos) && savedCameraPos.length === 3) {
        console.log('[Public Viewer] Setting camera position to:', savedCameraPos);
        setCameraPosition([savedCameraPos[0], savedCameraPos[1], savedCameraPos[2]]);
      } else {
        console.log('[Public Viewer] No saved camera position found, using default [10, 10, 10]');
      }
      const savedTarget = threeJSScene?.userData?.camera?.target;
      console.log('[Public Viewer] savedTarget:', savedTarget);
      if (savedTarget && Array.isArray(savedTarget) && savedTarget.length === 3) {
        setCameraTarget([savedTarget[0], savedTarget[1], savedTarget[2]]);
      }
      const savedQuat = threeJSScene?.userData?.camera?.quaternion;
      console.log('[Public Viewer] savedQuat:', savedQuat);
      if (savedQuat && Array.isArray(savedQuat) && savedQuat.length === 4) {
        setCameraQuaternion([savedQuat[0], savedQuat[1], savedQuat[2], savedQuat[3]]);
      }
      const savedFov = threeJSScene?.userData?.camera?.fov;
      if (typeof savedFov === 'number' && !Number.isNaN(savedFov)) {
        setCameraFov(savedFov);
      }
    } catch (e) {
      console.error('[PublicSpaceViewer] Failed to convert space:', e);
    }
  }, [spaceData]);

  // Handle fullscreen toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'h' || e.key === 'H') {
        setShowControls(!showControls);
      }
      if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showControls]);

  // Handle fullscreen change
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Handle object selection for modal
  const handleObjectSelect = async (assetId: string, assetType: string) => {
    console.log(`[PublicSpaceViewer] Object selected: ${assetId} (${assetType})`);

    setIsLoadingAsset(true);
    try {
      // Special handling for timeline-based text assets
      if (assetType === 'text' && typeof assetId === 'string' && assetId.startsWith('text_timeline/')) {
        const afterPrefix = assetId.split('text_timeline/')[1] || '';
        const slug = afterPrefix.split('#')[0];
        if (!slug) throw new Error('Invalid timeline text asset id (missing slug)');

        const res = await fetch(`/api/internal/get-content/${encodeURIComponent(slug)}`);
        if (!res.ok) throw new Error(`Failed to fetch text asset content for slug ${slug}`);
        const json = await res.json();

        // Shape as UnifiedSearchResult for DetailsOverlay
        const unifiedResult = {
          id: assetId,
          title: json?.title || slug,
          content_type: 'text',
          preview: (json?.content as string) || '',
          description: (json?.content as string) || '',
          metadata: { parent_slug: slug }
        } as any;

        setSelectedAsset(unifiedResult);
        return;
      }

      // Default handling for other asset types
      // Note: published space item IDs may be compound (e.g., uuid-timestamp-suffix). Try primary lookup; on 404, fall back to mediaUrl-only modal.
      const apiEndpoint = assetType === 'audio'
        ? `/api/audio-labeling/songs/${assetId}`
        : `/api/media-assets/${assetId}`;

      let response: Response | null = null;
      try {
        response = await fetch(apiEndpoint);
      } catch (e) {
        response = null;
      }

      if (!response || !response.ok) {
        console.warn('[PublicSpaceViewer] Primary asset fetch failed; falling back to lightweight modal from userData');
        // Build a minimal result using available info so the modal still opens
        const lightweightResult = {
          id: assetId,
          title: String(assetId),
          content_type: assetType,
          // Let DetailsOverlay render media via URL directly if present in userData lookups downstream
          // We set url to undefined here; DetailsOverlay can derive previews from metadata if available
        } as any;
        setSelectedAsset(lightweightResult);
        return;
      }

      const data = await response.json();
      const asset = assetType === 'audio' ? data : (data?.asset || data);

      const unifiedResult = {
        id: asset.id || assetId,
        title: asset.title || asset.filename || String(assetId),
        content_type: assetType,
        url: asset.cloudflare_url || asset.s3_url || asset.url,
        ...asset
      } as any;

      setSelectedAsset(unifiedResult);
    } catch (error) {
      console.error('[PublicSpaceViewer] Failed to fetch asset:', error);
      setSelectedAsset(null);
    } finally {
      setIsLoadingAsset(false);
    }
  };

  return (
    <div className="relative w-full h-screen bg-neutral-900 overflow-hidden">
      {/* R3F canvas rendering the same converted scene */}
      <Canvas
        style={{ width: '100%', height: '100%' }}
        camera={{
          position: cameraPosition,
          fov: cameraFov
        }}
      >
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} />
        <Environment preset="city" />

        <ThreeSceneR3F children={sceneChildren} onObjectSelect={handleObjectSelect} />

        <OrbitControls
          enablePan
          enableZoom
          enableRotate
          target={cameraTarget || undefined}
          makeDefault
        />

        {/* Apply saved camera pose exactly like the editor */}
        <CameraPoseApplier
          position={cameraPosition}
          quaternion={cameraQuaternion}
          target={cameraTarget}
          pullBackFactor={1.25}
        />
        {process.env.NODE_ENV === 'development' && <StatsGl />}
      </Canvas>

      {/* UI Overlays */}
      {showControls && (
        <>
          {/* Top Bar */}
          <div className="absolute top-4 left-4 right-4 flex justify-between items-start z-10 pointer-events-none">
            <div className="text-white pointer-events-auto">
              <h1 className="text-lg font-semibold" style={{ color: 'white' }}>
                {spaceData?.title || `Space ${spaceId}`}
              </h1>
              {spaceData?.description && (
                <p className="text-sm text-neutral-300 mt-1">
                  {spaceData.description}
                </p>
              )}
            </div>

            <div className="bg-black/70 backdrop-blur-sm rounded-lg px-4 py-2 text-white pointer-events-auto">
              <button
                onClick={toggleFullscreen}
                className="text-sm hover:text-blue-400 transition-colors"
              >
                {isFullscreen ? '⊡ Exit Fullscreen (F)' : '⊞ Fullscreen (F)'}
              </button>
            </div>
          </div>

          {/* Bottom Info Bar */}
          <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end z-10 pointer-events-none">
            <div className="bg-black/70 backdrop-blur-sm rounded-lg px-4 py-2 text-white max-w-md pointer-events-auto">
              <div className="text-sm text-neutral-300">
                Use mouse to orbit around the space. Scroll to zoom.
              </div>
            </div>

            <div className="bg-black/70 backdrop-blur-sm rounded-lg px-4 py-2 text-white pointer-events-auto">
              <div className="text-xs text-neutral-300">
                Press H to {showControls ? 'hide' : 'show'} controls
              </div>
              <div className="text-xs text-neutral-400">{sceneChildren.length} objects</div>
            </div>
          </div>
        </>
      )}

      {/* Minimal controls when hidden */}
      {!showControls && (
        <div className="absolute top-4 right-4 z-10">
          <button
            onClick={() => setShowControls(true)}
            className="bg-black/50 hover:bg-black/70 backdrop-blur-sm rounded-lg px-3 py-2 text-white text-sm transition-colors"
          >
            Show Controls (H)
          </button>
        </div>
      )}

      {/* Loading indicator */}
      {sceneChildren.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div className="bg-black/70 backdrop-blur-sm rounded-lg px-6 py-4 text-white text-center">
            <div className="text-lg mb-2">Loading Space...</div>
            <div className="text-sm text-neutral-300">Preparing 3D scene</div>
          </div>
        </div>
      )}

      {/* Asset Details Modal */}
      {selectedAsset && (
        <DetailsOverlay
          r={selectedAsset}
          onClose={() => setSelectedAsset(null)}
          onSearch={() => {}} // No search functionality needed in published view
        />
      )}
    </div>
  );
}

function CameraPoseApplier({ position, quaternion, target, pullBackFactor = 1 }: { position: [number, number, number]; quaternion: [number, number, number, number] | null; target: [number, number, number] | null; pullBackFactor?: number; }){
  const { camera, controls } = useThree() as any;
  useEffect(() => {
    try {
      if (position) {
        // Optionally pull the camera back slightly along its vector to match editor POV on publish
        const px = position[0];
        const py = position[1];
        const pz = position[2];
        if (pullBackFactor !== 1 && target) {
          const dir = new THREE.Vector3(px - target[0], py - target[1], pz - target[2]);
          dir.multiplyScalar(pullBackFactor);
          camera.position.set(target[0] + dir.x, target[1] + dir.y, target[2] + dir.z);
        } else {
          camera.position.set(px, py, pz);
        }
      }
      if (quaternion) {
        camera.quaternion.set(quaternion[0], quaternion[1], quaternion[2], quaternion[3]);
      }
      if (target && controls) {
        controls.target.set(target[0], target[1], target[2]);
        controls.update();
      }
    } catch {}
  }, [position, quaternion, target, camera, controls, pullBackFactor]);
  return null;
}
