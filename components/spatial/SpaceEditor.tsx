"use client";
import { useRef, useEffect, useState } from 'react';
import { EditorBridge, type EditorCommand, type EditorMessage } from '@/lib/spatial/editor-bridge';
import { convertSpaceToThreeJSScene, convertThreeJSSceneToSpace } from '@/lib/spatial/scene-conversion';

export interface SpaceEditorProps {
  spaceId: string;
  onSceneChange?: (sceneData: any) => void;
  onSelectionChange?: (selectedObjects: string[]) => void;
  onError?: (error: string) => void;
}

export default function SpaceEditor({ 
  spaceId, 
  onSceneChange, 
  onSelectionChange, 
  onError 
}: SpaceEditorProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [editorReady, setEditorReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [spaceData, setSpaceData] = useState<any>(null);
  const bridgeRef = useRef<EditorBridge | null>(null);

  useEffect(() => {
    if (!iframeRef.current) return;

    // Initialize editor bridge
    const bridge = new EditorBridge(iframeRef.current);
    bridgeRef.current = bridge;

    // Set up event handlers
    bridge.onReady = () => {
      setEditorReady(true);
      setLoading(false);
      console.log('Three.js Editor is ready');
      // Load space data when editor is ready
      loadSpaceData();
    };

    bridge.onError = (errorMsg: string) => {
      setError(errorMsg);
      setLoading(false);
      onError?.(errorMsg);
    };

    bridge.onMessage = (message: EditorMessage) => {
      switch (message.type) {
        case 'scene_changed':
          onSceneChange?.(message.data);
          break;
        case 'selection_changed':
          onSelectionChange?.(message.data.selectedObjects || []);
          break;
        case 'object_added':
        case 'object_removed':
        case 'object_transformed':
          // Notify parent of scene changes
          onSceneChange?.(message.data);
          break;
        case 'scene_exported':
          // Handle scene export response
          handleSceneExport(message.data);
          break;
        default:
          console.log('Unknown editor message:', message);
      }
    };

    // Initialize bridge
    bridge.initialize();

    // Cleanup
    return () => {
      bridge.destroy();
    };
  }, [onSceneChange, onSelectionChange, onError]);

  // Send command to editor
  const sendCommand = (command: EditorCommand) => {
    if (!bridgeRef.current || !editorReady) {
      console.warn('Editor not ready, queuing command:', command);
      return;
    }
    bridgeRef.current.sendCommand(command);
  };

  // Fetch space data from API
  const loadSpaceData = async () => {
    try {
      const response = await fetch(`/api/spaces/${spaceId}`);
      if (!response.ok) {
        throw new Error(`Failed to load space: ${response.statusText}`);
      }
      const space = await response.json();
      setSpaceData(space);
      
      // Convert to Three.js format and load into editor
      const threeJSScene = convertSpaceToThreeJSScene(space);
      sendCommand({
        type: 'load_scene',
        data: threeJSScene,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to load space data';
      setError(errorMsg);
      onError?.(errorMsg);
    }
  };

  // Load space data into editor
  const loadSpace = async (spaceData: any) => {
    const threeJSScene = convertSpaceToThreeJSScene(spaceData);
    sendCommand({
      type: 'load_scene',
      data: threeJSScene,
    });
  };

  // Save current scene
  const saveScene = async () => {
    if (!spaceData) {
      setError('No space data loaded');
      return;
    }

    try {
      // Request scene export from editor
      sendCommand({
        type: 'export_scene',
        data: {},
      });
      
      // Note: The actual save will happen in the message handler when we receive the exported scene
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to save scene';
      setError(errorMsg);
      onError?.(errorMsg);
    }
  };

  // Handle scene export response and save to API
  const handleSceneExport = async (exportedScene: any) => {
    if (!spaceData) return;

    try {
      // Convert Three.js scene back to SpaceAsset format
      const updatedSpace = convertThreeJSSceneToSpace(exportedScene, spaceData);
      
      // Save to API
      const response = await fetch(`/api/spaces/${spaceId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedSpace),
      });

      if (!response.ok) {
        throw new Error(`Failed to save space: ${response.statusText}`);
      }

      const savedSpace = await response.json();
      setSpaceData(savedSpace);
      onSceneChange?.(savedSpace);
      
      console.log('Space saved successfully');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to save space';
      setError(errorMsg);
      onError?.(errorMsg);
    }
  };

  if (error) {
    return (
      <div className="h-[600px] bg-red-900/20 border border-red-700 rounded-lg flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-400 text-lg mb-2">Editor Error</div>
          <div className="text-red-300 text-sm">{error}</div>
          <button 
            className="mt-3 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {loading && (
        <div className="absolute inset-0 bg-neutral-900/80 flex items-center justify-center z-10 rounded-lg">
          <div className="text-center">
            <div className="text-white text-lg mb-2">Loading Three.js Editor...</div>
            <div className="text-neutral-300 text-sm">Initializing 3D environment</div>
          </div>
        </div>
      )}
      
      <iframe
        ref={iframeRef}
        src="/three-js-editor/index.html"
        className="w-full h-[600px] border border-neutral-700 rounded-lg"
        title="Three.js Editor"
        sandbox="allow-scripts allow-same-origin allow-forms"
        style={{ 
          opacity: loading ? 0.3 : 1,
          transition: 'opacity 0.3s ease-in-out'
        }}
      />

      {/* Editor Controls Overlay */}
      {editorReady && (
        <div className="absolute top-3 right-3 flex gap-2">
          <button
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded"
            onClick={saveScene}
          >
            Save Scene
          </button>
          <button
            className="px-3 py-1.5 bg-neutral-700 hover:bg-neutral-600 text-white text-xs rounded"
            onClick={() => sendCommand({ type: 'clear_scene', data: {} })}
          >
            Clear
          </button>
        </div>
      )}

      {/* Status Indicator */}
      <div className="absolute bottom-3 left-3 text-xs text-neutral-300">
        {loading ? 'Loading...' : editorReady ? 'Editor Ready' : 'Initializing...'}
      </div>
    </div>
  );
}
