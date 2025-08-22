"use client";
import { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { EditorBridge, type EditorCommand, type EditorMessage } from '@/lib/spatial/editor-bridge';
import { convertSpaceToThreeJSScene, convertThreeJSSceneToSpace } from '@/lib/spatial/scene-conversion';

export interface SpaceEditorProps {
  spaceId: string;
  onSceneChange?: (sceneData: any) => void;
  onSelectionChange?: (selectedObjects: string[]) => void;
  onError?: (error: string) => void;
}

export interface SpaceEditorRef {
  saveScene: () => Promise<void>;
  loadSpace: (spaceData: any) => Promise<void>;
  addAsset: (asset: any) => Promise<void>;
  addLayout: (layout: any) => Promise<void>;
}

const SpaceEditor = forwardRef<SpaceEditorRef, SpaceEditorProps>(({
  spaceId,
  onSceneChange,
  onSelectionChange,
  onError
}, ref) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [editorReady, setEditorReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [spaceData, setSpaceData] = useState<any>(null);
  const bridgeRef = useRef<EditorBridge | null>(null);
  const callbacksRef = useRef<{ onSceneChange?: (d:any)=>void; onSelectionChange?: (s:string[])=>void; onError?: (e:string)=>void }>({ onSceneChange, onSelectionChange, onError });
  const lastLoadedIdRef = useRef<string | null>(null);

  // Keep latest callbacks without re-initializing the bridge
  useEffect(() => {
    callbacksRef.current = { onSceneChange, onSelectionChange, onError };
  }, [onSceneChange, onSelectionChange, onError]);

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    saveScene: async () => {
      await saveScene();
    },
    loadSpace: async (spaceData: any) => {
      await loadSpace(spaceData);
    },
    addAsset: async (asset: any) => {
      await addAssetToEditor(asset);
    },
    addLayout: async (layout: any) => {
      await addLayoutToEditor(layout);
    }
  }), []);

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
      // Load space data when editor is ready (guard against double-load)
      if (spaceId && lastLoadedIdRef.current !== spaceId) {
        loadSpaceData();
        lastLoadedIdRef.current = spaceId;
      }
    };

    bridge.onError = (errorMsg: string) => {
      setError(errorMsg);
      setLoading(false);
      callbacksRef.current.onError?.(errorMsg);
    };

    bridge.onMessage = (message: EditorMessage) => {
      switch (message.type) {
        case 'scene_changed':
          callbacksRef.current.onSceneChange?.(message.data);
          break;
        case 'selection_changed':
          callbacksRef.current.onSelectionChange?.(message.data.selectedObjects || []);
          break;
        case 'scene_loaded':
          // If editor reports empty scene and our space has no items, seed samples
          try {
            const isEmptyEditor = !message.data || message.data.objectCount === 0;
            const hasNoItems = !(spaceData?.space?.items && spaceData.space.items.length > 0);
            if (editorReady && isEmptyEditor && hasNoItems) {
              console.log('[SpaceEditor] Editor scene empty after load; seeding sample objects…');
              // Defer to ensure editor settled
              setTimeout(() => { addSampleObjects(); }, 0);
            }
          } catch {}
          break;
        case 'object_added':
        case 'object_removed':
        case 'object_transformed':
          // Notify parent of scene changes
          callbacksRef.current.onSceneChange?.(message.data);
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
  }, []);

  // Reload space data when spaceId changes
  useEffect(() => {
    if (editorReady && spaceId && lastLoadedIdRef.current !== spaceId) {
      loadSpaceData();
      lastLoadedIdRef.current = spaceId;
    }
  }, [spaceId, editorReady]);

  // Send command to editor
  const sendCommand = (command: EditorCommand) => {
    if (!bridgeRef.current) {
      console.warn('Bridge not available, cannot send command:', command);
      return Promise.resolve();
    }
    if (!editorReady) {
      console.warn('Editor not ready, queuing command:', command);
      // Still send the command - the bridge will queue it
    }
    return bridgeRef.current.sendCommand(command);
  };

  // Fetch space data from API
  const loadSpaceData = async () => {
    try {
      console.log('[SpaceEditor] Loading space data for:', spaceId);
      const response = await fetch(`/api/spaces/${spaceId}`, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Failed to load space: ${response.statusText}`);
      }
      const space = await response.json();
      console.log('[SpaceEditor] Loaded space:', space);
      setSpaceData(space);

      // Convert to Three.js format and load into editor
      const threeJSScene = convertSpaceToThreeJSScene(space);
      console.log('[SpaceEditor] Converted to Three.js scene:', threeJSScene);
      console.log('[SpaceEditor] Scene children count:', threeJSScene.object.children.length);
      console.log('[SpaceEditor] Space items:', space.space?.items || 'No items found');
      
      await sendCommand({
        type: 'load_scene',
        data: threeJSScene,
      });
      console.log('[SpaceEditor] Scene loaded into editor');
      
      // If space is empty, add some sample objects for testing
      if ((!space.space?.items || space.space.items.length === 0) && editorReady) {
        console.log('[SpaceEditor] Space is empty, adding sample objects for testing...');
        await addSampleObjects();
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to load space data';
      console.error('[SpaceEditor] Load error:', err);
      setError(errorMsg);
      onError?.(errorMsg);
    }
  };

  // Add sample objects for testing
  const addSampleObjects = async () => {
    const sampleObjects = [
      {
        type: 'add_object',
        data: {
          type: 'Mesh',
          geometry: { type: 'BoxGeometry', width: 1, height: 1, depth: 1 },
          material: { type: 'MeshBasicMaterial', color: 0x00ff00 },
          position: [0, 0.5, 0],
          name: 'Sample Cube'
        }
      },
      {
        type: 'add_object', 
        data: {
          type: 'Mesh',
          geometry: { type: 'SphereGeometry', radius: 0.5 },
          material: { type: 'MeshBasicMaterial', color: 0xff0000 },
          position: [2, 0.5, 0],
          name: 'Sample Sphere'
        }
      },
      {
        type: 'add_object',
        data: {
          type: 'Mesh', 
          geometry: { type: 'PlaneGeometry', width: 2, height: 2 },
          material: { type: 'MeshBasicMaterial', color: 0x0000ff },
          position: [-2, 1, 0],
          rotation: [0, 0, 0],
          name: 'Sample Plane'
        }
      }
    ];

    for (const obj of sampleObjects) {
      await sendCommand(obj);
    }
  };

  // Load space data into editor
  const loadSpace = async (spaceData: any) => {
    const threeJSScene = convertSpaceToThreeJSScene(spaceData);
    await sendCommand({
      type: 'load_scene',
      data: threeJSScene,
    });
  };

  // Helpers: add objects based on selected assets/layouts
  const addAssetToEditor = async (asset: any) => {
    const assetType = (asset.content_type || asset.type || 'unknown').toLowerCase();
    const id = asset.id || `asset-${Date.now()}`;
    const color = assetType.includes('image') ? 0x3b82f6 : assetType.includes('video') ? 0xef4444 : 0x6b7280;

    // plane for image/video, box otherwise
    const geometry = assetType.includes('image') || assetType.includes('video')
      ? { type: 'PlaneGeometry', width: 2, height: 2 }
      : { type: 'BoxGeometry', width: 1, height: 1, depth: 1 };

    await sendCommand({
      type: 'add_object',
      data: {
        type: 'Mesh',
        geometry,
        material: { type: 'MeshBasicMaterial', color },
        position: [Math.random() * 4 - 2, 0.5, Math.random() * 4 - 2],
        name: asset.title || asset.filename || id,
        userData: { assetType, assetId: id }
      }
    });
  };

  const addLayoutToEditor = async (layout: any) => {
    const items = layout?.layout_data?.items || [];
    const scale = 0.02;
    for (const item of items) {
      const type = (item.type || 'unknown').toLowerCase();
      const isPlane = type === 'image' || type === 'video';
      const geometry = isPlane
        ? { type: 'PlaneGeometry', width: 2, height: 2 }
        : { type: 'BoxGeometry', width: 1, height: 1, depth: 1 };
      const color = type === 'image' ? 0x3b82f6 : type === 'video' ? 0xef4444 : 0x8b5cf6;

      await sendCommand({
        type: 'add_object',
        data: {
          type: 'Mesh',
          geometry,
          material: { type: 'MeshBasicMaterial', color },
          position: [ (item.x || 0) * scale, 0.5, (item.y || 0) * scale ],
          scale: [ Math.max((item.w || 100) * scale, 1), 1, Math.max((item.h || 100) * scale, 1) ],
          name: item.snippet || `Layout Item` ,
          userData: { assetType: 'layout_reference', layoutId: layout.id, layoutItemId: item.id }
        }
      });
    }
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
});

SpaceEditor.displayName = 'SpaceEditor';

export default SpaceEditor;
