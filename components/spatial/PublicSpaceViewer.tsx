"use client";
import { useState, useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, StatsGl } from '@react-three/drei';
import { convertSpaceToThreeJSScene } from '@/lib/spatial/scene-conversion';
import ThreeSceneR3F from './ThreeSceneR3F';

export interface PublicSpaceViewerProps {
  spaceData: any;
  spaceId: string;
}

export default function PublicSpaceViewer({ spaceData, spaceId }: PublicSpaceViewerProps) {
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [sceneChildren, setSceneChildren] = useState<any[]>([]);
  const [cameraPosition, setCameraPosition] = useState<[number, number, number]>([10, 10, 10]);

  // Build scene JSON using the EXACT same conversion as SpaceEditor, then render via R3F
  useEffect(() => {
    if (!spaceData) return;
    try {
      const threeJSScene = convertSpaceToThreeJSScene(spaceData);
      const children = threeJSScene?.object?.children || [];
      setSceneChildren(children);
      
      // Set camera position from saved scene data
      const savedCameraPos = threeJSScene?.userData?.camera?.position;
      if (savedCameraPos && Array.isArray(savedCameraPos) && savedCameraPos.length === 3) {
        setCameraPosition([savedCameraPos[0], savedCameraPos[1], savedCameraPos[2]]);
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

  return (
    <div className="relative w-full h-screen bg-neutral-900 overflow-hidden">
      {/* R3F canvas rendering the same converted scene */}
      <Canvas 
        style={{ width: '100%', height: '100%' }} 
        camera={{ 
          position: cameraPosition, 
          fov: 60 
        }}
      >
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} />
        <Environment preset="city" />

        <ThreeSceneR3F children={sceneChildren} />

        <OrbitControls enablePan enableZoom enableRotate />
        {process.env.NODE_ENV === 'development' && <StatsGl />}
      </Canvas>

      {/* UI Overlays */}
      {showControls && (
        <>
          {/* Top Bar */}
          <div className="absolute top-4 left-4 right-4 flex justify-between items-start z-10 pointer-events-none">
            <div className="bg-black/70 backdrop-blur-sm rounded-lg px-4 py-2 text-white pointer-events-auto">
              <h1 className="text-lg font-semibold">
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
    </div>
  );
}
