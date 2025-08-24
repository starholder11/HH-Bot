"use client";
import { useState, useEffect, useRef, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, StatsGl, PointerLockControls, FlyControls } from '@react-three/drei';
import SpaceScene from './SpaceScene';
import { convertSpaceToThreeJSScene } from '@/lib/spatial/scene-conversion';
import { SpaceAssetData } from '@/lib/spatial/types';
import { LODManager } from '@/lib/spatial/lod-manager';
import { usePerformanceMonitor } from '@/hooks/usePerformanceMonitor';
import PerformanceMonitor from './PerformanceMonitor';

export interface PublicSpaceViewerProps {
  spaceData: any;
  spaceId: string;
}

type CameraMode = 'orbit' | 'first-person' | 'fly';

export default function PublicSpaceViewer({ spaceData, spaceId }: PublicSpaceViewerProps) {
  const [cameraMode, setCameraMode] = useState<CameraMode>('orbit');
  const [spaceItems, setSpaceItems] = useState<SpaceAssetData[]>([]);
  const [cameraPosition, setCameraPosition] = useState<[number, number, number]>([4, 3, 6]);
  const [selectedItem, setSelectedItem] = useState<SpaceAssetData | null>(null);
  const [hoveredItem, setHoveredItem] = useState<SpaceAssetData | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const cameraRef = useRef<any>(null);
  const rendererRef = useRef<any>(null);
  const lodManagerRef = useRef<LODManager>(new LODManager());
  
  const { metrics, isPerformanceAcceptable } = usePerformanceMonitor(rendererRef.current);

  // Convert space data to items
  useEffect(() => {
    if (!spaceData) return;

    try {
      const items = Array.isArray(spaceData?.space?.items) ? spaceData.space.items : [];
      console.log('[PublicSpaceViewer] Loaded space items:', items.length);
      setSpaceItems(items);
    } catch (error) {
      console.error('[PublicSpaceViewer] Error processing space data:', error);
    }
  }, [spaceData]);

  // Camera mode descriptions
  const cameraDescriptions = {
    orbit: 'Click and drag to orbit around the space. Scroll to zoom.',
    'first-person': 'Click to lock cursor, then use WASD to move and mouse to look around. Press ESC to unlock.',
    fly: 'Use WASD to fly around. Hold right mouse button and move to look around.'
  };

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

  // Handle escape key for controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'h' || e.key === 'H') {
        setShowControls(!showControls);
      }
      if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      }
      if (e.key >= '1' && e.key <= '3') {
        const modes: CameraMode[] = ['orbit', 'first-person', 'fly'];
        setCameraMode(modes[parseInt(e.key) - 1]);
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

  const handleSelectItem = (item: SpaceAssetData) => {
    setSelectedItem(item);
    console.log('[PublicSpaceViewer] Selected item:', item.title || item.assetType);
  };

  const handleHoverItem = (item: SpaceAssetData | null) => {
    setHoveredItem(item);
  };

  return (
    <div className="relative w-full h-screen bg-neutral-900 overflow-hidden">
      {/* Main 3D Canvas */}
      <Canvas
        ref={cameraRef}
        style={{ width: "100%", height: "100%" }}
        camera={{ position: cameraPosition, fov: 60 }}
        onCreated={({ gl }) => {
          rendererRef.current = gl;
          gl.shadowMap.enabled = true;
          gl.shadowMap.type = gl.PCFSoftShadowMap;
        }}
      >
        {/* Lighting */}
        <ambientLight intensity={0.4} />
        <directionalLight 
          position={[10, 10, 5]} 
          intensity={1} 
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />
        <pointLight position={[-10, -10, -10]} intensity={0.3} />

        {/* Environment */}
        <Environment preset="city" />

        {/* Floor */}
        <mesh 
          rotation={[-Math.PI / 2, 0, 0]} 
          position={[0, -0.01, 0]} 
          receiveShadow
        >
          <planeGeometry args={[200, 200]} />
          <meshStandardMaterial color="#1a1a1a" />
        </mesh>

        {/* Space Scene */}
        <SpaceScene 
          items={spaceItems}
          cameraPosition={cameraPosition}
          lodManager={lodManagerRef.current}
          onSelectItem={handleSelectItem}
          onHoverItem={handleHoverItem}
        />

        {/* Camera Controls */}
        {cameraMode === 'orbit' && (
          <OrbitControls 
            enablePan 
            enableZoom 
            enableRotate 
            maxDistance={100}
            minDistance={1}
            onChange={(e) => {
              if (e?.target?.object?.position) {
                const pos = e.target.object.position;
                setCameraPosition([pos.x, pos.y, pos.z]);
              }
            }}
          />
        )}
        {cameraMode === 'first-person' && <PointerLockControls />}
        {cameraMode === 'fly' && (
          <FlyControls 
            movementSpeed={10} 
            rollSpeed={0.5} 
            dragToLook 
            autoForward={false}
          />
        )}

        {/* Performance Stats (only in dev) */}
        {process.env.NODE_ENV === 'development' && <StatsGl />}
      </Canvas>

      {/* UI Overlays */}
      {showControls && (
        <>
          {/* Top Bar */}
          <div className="absolute top-4 left-4 right-4 flex justify-between items-start z-10">
            <div className="bg-black/70 backdrop-blur-sm rounded-lg px-4 py-2 text-white">
              <h1 className="text-lg font-semibold">
                {spaceData?.title || `Space ${spaceId}`}
              </h1>
              {spaceData?.description && (
                <p className="text-sm text-neutral-300 mt-1">
                  {spaceData.description}
                </p>
              )}
            </div>

            <div className="bg-black/70 backdrop-blur-sm rounded-lg px-4 py-2 text-white">
              <button
                onClick={toggleFullscreen}
                className="text-sm hover:text-blue-400 transition-colors"
              >
                {isFullscreen ? '⊡ Exit Fullscreen (F)' : '⊞ Fullscreen (F)'}
              </button>
            </div>
          </div>

          {/* Camera Mode Selector */}
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-10">
            <div className="bg-black/70 backdrop-blur-sm rounded-lg px-4 py-2 text-white">
              <div className="flex gap-2">
                {(['orbit', 'first-person', 'fly'] as CameraMode[]).map((mode, index) => (
                  <button
                    key={mode}
                    onClick={() => setCameraMode(mode)}
                    className={`px-3 py-1 text-sm rounded transition-colors ${
                      cameraMode === mode 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-neutral-700 hover:bg-neutral-600 text-neutral-300'
                    }`}
                  >
                    {index + 1}. {mode.charAt(0).toUpperCase() + mode.slice(1).replace('-', ' ')}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom Info Bar */}
          <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end z-10">
            <div className="bg-black/70 backdrop-blur-sm rounded-lg px-4 py-2 text-white max-w-md">
              <div className="text-sm text-neutral-300">
                {cameraDescriptions[cameraMode]}
              </div>
              {selectedItem && (
                <div className="mt-2 pt-2 border-t border-neutral-600">
                  <div className="text-sm font-medium">
                    {selectedItem.title || selectedItem.assetType}
                  </div>
                  {selectedItem.description && (
                    <div className="text-xs text-neutral-400 mt-1">
                      {selectedItem.description}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="bg-black/70 backdrop-blur-sm rounded-lg px-4 py-2 text-white">
              <div className="text-xs text-neutral-300">
                Press H to {showControls ? 'hide' : 'show'} controls
              </div>
              <div className="text-xs text-neutral-400">
                {spaceItems.length} objects • {metrics.fps.toFixed(1)} FPS
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

      {/* Performance Warning */}
      {!isPerformanceAcceptable() && (
        <div className="absolute top-20 left-1/2 transform -translate-x-1/2 bg-red-600/90 text-white px-4 py-2 rounded-lg text-sm z-10">
          ⚠ Performance Warning: {metrics.fps.toFixed(1)} FPS
        </div>
      )}

      {/* Loading indicator for items */}
      {spaceItems.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="bg-black/70 backdrop-blur-sm rounded-lg px-6 py-4 text-white text-center">
            <div className="text-lg mb-2">Loading Space Content...</div>
            <div className="text-sm text-neutral-300">Preparing 3D objects</div>
          </div>
        </div>
      )}
    </div>
  );
}
