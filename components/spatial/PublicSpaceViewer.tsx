"use client";
import { useState, useEffect, useRef } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment, StatsGl } from '@react-three/drei';
import * as THREE from 'three';
import { convertSpaceToThreeJSScene } from '@/lib/spatial/scene-conversion';
import ThreeSceneR3F from './ThreeSceneR3F';
import DetailsOverlay from '@/app/visual-search/components/DetailsOverlay';
import { CameraControlsManager, type CameraMode } from './CameraControls';

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

  // Camera control mode
  const [cameraMode, setCameraMode] = useState<CameraMode>('orbit');
  const [pointerLocked, setPointerLocked] = useState(false);
  const [cameraDistance, setCameraDistance] = useState<number>(0);

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

  // Handle pointer lock for first-person mode
  const handlePointerLock = () => {
    if (cameraMode === 'pointerLock') {
      const canvas = document.querySelector('canvas');
      if (canvas) {
        canvas.requestPointerLock();
      }
    }
  };

  // Handle camera mode switching
  const switchCameraMode = (mode: CameraMode) => {
    setCameraMode(mode);
    if (mode === 'pointerLock') {
      setPointerLocked(false);
    }
  };

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle shortcuts if pointer is locked (for first-person controls)
      if (document.pointerLockElement) return;

      if (e.key === 'h' || e.key === 'H') {
        setShowControls(!showControls);
      }
      if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      }
      // Camera mode shortcuts
      if (e.key === '1') switchCameraMode('orbit');
      if (e.key === '2') switchCameraMode('fly');
      if (e.key === '3') switchCameraMode('firstPerson');
      if (e.key === '4') switchCameraMode('pointerLock');
      // Enter pointer lock mode
      if (e.key === 'l' || e.key === 'L') {
        if (cameraMode === 'pointerLock') {
          handlePointerLock();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showControls, cameraMode]);

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
      // Note: published space item IDs may be compound (e.g., uuid-timestamp-suffix). Try primary lookup; on 404, normalize ID and retry before falling back.
      const apiEndpoint = assetType === 'audio'
        ? `/api/audio-labeling/songs/${assetId}`
        : `/api/media-assets/${assetId}`;

      let response: Response | null = null;
      try {
        response = await fetch(apiEndpoint);
      } catch (e) {
        response = null;
      }

      // If primary lookup failed, attempt with normalized base UUID (strip suffixes like -timestamp-random)
      const extractBaseUuid = (id: string): string => {
        const match = id.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
        return match ? match[0] : id;
      };

      if (!response || !response.ok) {
        const baseId = extractBaseUuid(assetId);
        if (baseId && baseId !== assetId) {
          try {
            const normalizedEndpoint = assetType === 'audio'
              ? `/api/audio-labeling/songs/${baseId}`
              : `/api/media-assets/${baseId}`;
            console.warn('[PublicSpaceViewer] Primary fetch failed. Retrying with normalized id:', baseId);
            const normRes = await fetch(normalizedEndpoint);
            if (normRes.ok) {
              const normData = await normRes.json();
              const normAsset = assetType === 'audio' ? normData : (normData?.asset || normData);
              const unifiedNorm = {
                id: normAsset.id || baseId,
                title: normAsset.title || normAsset.filename || String(baseId),
                content_type: assetType,
                url: normAsset.cloudflare_url || normAsset.s3_url || normAsset.url,
                ...normAsset
              } as any;
              setSelectedAsset(unifiedNorm);
              return;
            }
          } catch {}
        }

        console.warn('[PublicSpaceViewer] Primary/normalized asset fetch failed; falling back to lightweight modal from userData');
        // Try to find the clicked child in the current scene to extract mediaUrl
        const child = (sceneChildren || []).find((c: any) => c?.userData?.assetId === assetId);
        const childMediaUrl: string | undefined = child?.userData?.mediaUrl;
        const lightweightResult = {
          id: assetId,
          title: String(assetId),
          content_type: assetType,
          url: childMediaUrl, // DetailsOverlay will display image/video/audio directly with this
          metadata: child?.userData || {}
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

        {/* Conditional camera controls based on mode */}
        {cameraMode === 'orbit' && (
          <OrbitControls
            enablePan
            enableZoom
            enableRotate
            target={cameraTarget || undefined}
            makeDefault
            minDistance={0.1}
            maxDistance={2000}
            enableDamping
            dampingFactor={0.05}
            zoomSpeed={1.2}
          />
        )}

        {/* Custom camera controls for other modes */}
        <CameraControlsManager mode={cameraMode} enabled={cameraMode !== 'orbit'} />

        {/* Apply saved camera pose exactly like the editor (only for orbit mode) */}
        {cameraMode === 'orbit' && (
          <CameraPoseApplier
            position={cameraPosition}
            quaternion={cameraQuaternion}
            target={cameraTarget}
            pullBackFactor={1.25}
          />
        )}

        {/* Camera distance tracker */}
        <CameraDistanceTracker onDistanceChange={setCameraDistance} />
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

            <div className="flex gap-2">
              {/* Camera Mode Controls */}
              <div className="bg-black/70 backdrop-blur-sm rounded-lg px-4 py-2 text-white pointer-events-auto">
                <div className="text-xs text-neutral-300 mb-2">Camera Mode</div>
                <div className="flex gap-1">
                  <button
                    onClick={() => switchCameraMode('orbit')}
                    className={`px-2 py-1 text-xs rounded transition-colors ${
                      cameraMode === 'orbit' 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-neutral-700 hover:bg-neutral-600 text-neutral-300'
                    }`}
                    title="Orbit Camera (1)"
                  >
                    Orbit
                  </button>
                  <button
                    onClick={() => switchCameraMode('fly')}
                    className={`px-2 py-1 text-xs rounded transition-colors ${
                      cameraMode === 'fly' 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-neutral-700 hover:bg-neutral-600 text-neutral-300'
                    }`}
                    title="Fly Camera (2)"
                  >
                    Fly
                  </button>
                  <button
                    onClick={() => switchCameraMode('firstPerson')}
                    className={`px-2 py-1 text-xs rounded transition-colors ${
                      cameraMode === 'firstPerson' 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-neutral-700 hover:bg-neutral-600 text-neutral-300'
                    }`}
                    title="First Person (3)"
                  >
                    FPS
                  </button>
                  <button
                    onClick={() => switchCameraMode('pointerLock')}
                    className={`px-2 py-1 text-xs rounded transition-colors ${
                      cameraMode === 'pointerLock' 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-neutral-700 hover:bg-neutral-600 text-neutral-300'
                    }`}
                    title="Pointer Lock (4)"
                  >
                    Lock
                  </button>
                </div>
                {cameraMode === 'pointerLock' && (
                  <button
                    onClick={handlePointerLock}
                    className="mt-2 px-2 py-1 text-xs bg-green-600 hover:bg-green-700 rounded transition-colors"
                    title="Click to lock pointer (L)"
                  >
                    Lock Pointer (L)
                  </button>
                )}
              </div>

              {/* Fullscreen Control */}
              <div className="bg-black/70 backdrop-blur-sm rounded-lg px-4 py-2 text-white pointer-events-auto">
                <button
                  onClick={toggleFullscreen}
                  className="text-sm hover:text-blue-400 transition-colors"
                >
                  {isFullscreen ? '⊡ Exit Fullscreen (F)' : '⊞ Fullscreen (F)'}
                </button>
              </div>
            </div>
          </div>

          {/* Bottom Info Bar */}
          <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end z-10 pointer-events-none">
            <div className="bg-black/70 backdrop-blur-sm rounded-lg px-4 py-2 text-white max-w-md pointer-events-auto">
              <div className="text-sm text-neutral-300">
                {cameraMode === 'orbit' && 'Use mouse to orbit around the space. Scroll to zoom.'}
                {cameraMode === 'fly' && 'WASD to move, mouse to look. Q/E for up/down.'}
                {cameraMode === 'firstPerson' && 'WASD to move, mouse to look around.'}
                {cameraMode === 'pointerLock' && 'WASD to move, mouse to look. Space to jump. Press L to lock pointer.'}
              </div>
            </div>

            <div className="bg-black/70 backdrop-blur-sm rounded-lg px-4 py-2 text-white pointer-events-auto">
              <div className="text-xs text-neutral-300">
                Press H to {showControls ? 'hide' : 'show'} controls • 1-4 for camera modes
              </div>
              <div className="text-xs text-neutral-400">
                {sceneChildren.length} objects • {cameraMode} mode
                {cameraMode === 'orbit' && ` • Zoom: ${cameraDistance.toFixed(1)}u`}
              </div>
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

function CameraDistanceTracker({ onDistanceChange }: { onDistanceChange: (distance: number) => void }) {
  const { camera, controls } = useThree() as any;
  
  useFrame(() => {
    if (controls && controls.target) {
      const distance = camera.position.distanceTo(controls.target);
      onDistanceChange(distance);
    }
  });
  
  return null;
}
