"use client";
import { useState, useEffect, useRef } from 'react';
import { convertSpaceToThreeJSScene } from '@/lib/spatial/scene-conversion';

export interface PublicSpaceViewerProps {
  spaceData: any;
  spaceId: string;
}

export default function PublicSpaceViewer({ spaceData, spaceId }: PublicSpaceViewerProps) {
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [editorReady, setEditorReady] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Load space data into editor using the EXACT same method as SpaceEditor
  useEffect(() => {
    if (!spaceData || !editorReady) return;

    const loadSpaceData = async () => {
      try {
        console.log('[PublicSpaceViewer] Loading space data:', spaceData);
        
        // Convert to Three.js format using the same conversion as the editor
        const threeJSScene = convertSpaceToThreeJSScene(spaceData);
        console.log('[PublicSpaceViewer] Converted to Three.js scene:', threeJSScene);

        // Send load command to editor iframe
        if (iframeRef.current?.contentWindow) {
          iframeRef.current.contentWindow.postMessage({
            type: 'load_scene',
            data: threeJSScene,
          }, '*');
          console.log('[PublicSpaceViewer] Scene loaded into editor');
        }
      } catch (err) {
        console.error('[PublicSpaceViewer] Load error:', err);
      }
    };

    loadSpaceData();
  }, [spaceData, editorReady]);

  // Handle messages from editor iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;

      const { type, data } = event.data;
      console.log('[PublicSpaceViewer] Received message:', type, data);

      switch (type) {
        case 'editor_ready':
          console.log('[PublicSpaceViewer] Editor is ready');
          setEditorReady(true);
          break;
        case 'scene_changed':
          // Ignore scene changes in public viewer
          break;
        case 'selection_changed':
          // Ignore selection changes in public viewer
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

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
      {/* Three.js Editor iframe - same as SpaceEditor but read-only */}
      <iframe
        ref={iframeRef}
        src="/three-js-editor/index.html"
        className="w-full h-full border-none"
        style={{ width: '100%', height: '100%', border: 'none' }}
      />

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
              <div className="text-xs text-neutral-400">
                {editorReady ? 'Ready' : 'Loading...'}
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
      {!editorReady && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div className="bg-black/70 backdrop-blur-sm rounded-lg px-6 py-4 text-white text-center">
            <div className="text-lg mb-2">Loading Space...</div>
            <div className="text-sm text-neutral-300">Preparing 3D editor</div>
          </div>
        </div>
      )}
    </div>
  );
}
