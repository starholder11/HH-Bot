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
  sendCommand: (command: any) => Promise<void>;
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
  const pendingSaveRef = useRef<boolean>(false);

  // Keep latest callbacks without re-initializing the bridge
  useEffect(() => {
    callbacksRef.current = { onSceneChange, onSelectionChange, onError };
  }, [onSceneChange, onSelectionChange, onError]);

  // Expose methods to parent component will be set after function declarations

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

      // Force dark theme by injecting CSS
      try {
        const iframeDoc = iframeRef.current?.contentDocument;
        if (iframeDoc) {
          const style = iframeDoc.createElement('style');
          style.textContent = `
            /* Force dark theme styles */
            :root { color-scheme: dark; }
            @media (prefers-color-scheme: light) {
              /* Override light theme with dark theme styles */
              button { color: #aaa !important; background-color: #222 !important; }
              button:hover { color: #ccc !important; background-color: #444 !important; }
              button.selected { color: #fff !important; background-color: #08f !important; }
              input, textarea { background-color: #222 !important; border: 1px solid transparent !important; color: #888 !important; }
              select { color: #aaa !important; background-color: #222 !important; }
              select:hover { color: #ccc !important; background-color: #444 !important; }
              #menubar { background: #111 !important; }
              #sidebar { background-color: #111 !important; }
              #tabs { background-color: #1b1b1b !important; border-top: 1px solid #222 !important; }
              #toolbar { background-color: #111 !important; }
              .Outliner { background: #222 !important; }
              .TabbedPanel .Tabs { background-color: #1b1b1b !important; }
              .Listbox { color: #888 !important; background: #222 !important; }
            }
          `;
          iframeDoc.head.appendChild(style);
        }
      } catch (e) {
        console.warn('Could not inject dark theme CSS:', e);
      }

      // Load space data when editor is ready (guard against double-load)
      if (spaceId && lastLoadedIdRef.current !== spaceId) {
        loadSpaceData();
        lastLoadedIdRef.current = spaceId;
      }
      // If a save was in-flight when the iframe reloaded, re-request export
      if (pendingSaveRef.current) {
        console.log('[SpaceEditor] Editor ready during pending save; re-requesting export...');
        sendCommand({ type: 'export_scene', data: {} });
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
          console.log('[SpaceEditor] Received scene export:', message.data);
          pendingSaveRef.current = false;
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
    
    // Use the same logic as visual search to extract media URL
    const originalMediaUrl = (
      (asset.metadata?.cloudflare_url as string | undefined) ||
      (asset.metadata?.s3_url as string | undefined) ||
      (asset.url as string | undefined) ||
      (asset.s3_url as string | undefined) ||
      (asset.cloudflare_url as string | undefined)
    ) || null;

    // Use proxy for images to avoid CORS issues
    const mediaUrl = originalMediaUrl && (assetType.includes('image') || assetType.includes('video'))
      ? `/api/proxy?url=${encodeURIComponent(originalMediaUrl)}`
      : originalMediaUrl;

    // plane for image/video, box otherwise
    const geometry = assetType.includes('image') || assetType.includes('video')
      ? { type: 'PlaneGeometry', width: 1, height: 1 }
      : { type: 'BoxGeometry', width: 1, height: 1, depth: 1 };

    await sendCommand({
      type: 'add_object',
      data: {
        type: 'Mesh',
        geometry,
        material: { type: 'MeshBasicMaterial', color },
        position: [Math.random() * 4 - 2, 0.5, Math.random() * 4 - 2],
        name: asset.title || asset.filename || id,
        userData: { assetType, assetId: id, mediaUrl }
      }
    });
  };

  // Resolve media URL and canonical assetId for a layout item
  const resolveLayoutMedia = async (item: any, type: string): Promise<{ mediaUrl: string | null; assetId: string | null; extraUserData?: Record<string, any> }> => {
    try {
      const extra: Record<string, any> = {};

      // TEXT: fetch full content from timeline system
      if (type === 'text') {
        const raw = String(item.contentId || item.refId || item.id || '');
        // formats: text_timeline/slug#anchor or content_ref_slug
        let slug = '';
        const match = raw.match(/text_timeline\/([^#]+)/);
        if (match) slug = match[1];
        else if (raw.startsWith('content_ref_')) slug = raw.replace('content_ref_', '');
        else slug = raw;

        extra.textSlug = slug;

        // Fetch full text content
        try {
          const contentResponse = await fetch(`/api/internal/get-content/${encodeURIComponent(slug)}`);
          if (contentResponse.ok) {
            const contentData = await contentResponse.json();
            if (contentData.success && contentData.content) {
              extra.fullTextContent = contentData.content;
              console.log(`[SpaceEditor] Fetched text content for slug '${slug}': ${contentData.content.length} chars`);
            }
          } else {
            console.warn(`[SpaceEditor] Failed to fetch text content for slug '${slug}':`, contentResponse.status);
          }
        } catch (error) {
          console.error(`[SpaceEditor] Error fetching text content for slug '${slug}':`, error);
        }

        return { mediaUrl: null, assetId: null, extraUserData: extra };
      }

      // MEDIA (image/video/audio): resolve by contentId/refId first
      const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;
      const idStr: string = String(item.contentId || item.refId || item.id || '');
      let assetRef: string | null = null;
      if (uuidRegex.test(idStr)) assetRef = idStr.match(uuidRegex)?.[0] || null;
      else if (idStr) assetRef = idStr;

      // If layout item already carries mediaUrl, prefer it
      if (item.mediaUrl) {
        const url = String(item.mediaUrl);
        const proxied = type === 'image' || type === 'video' ? `/api/proxy?url=${encodeURIComponent(url)}` : url;
        return { mediaUrl: proxied, assetId: assetRef, extraUserData: extra };
      }

      if (!assetRef) return { mediaUrl: null, assetId: null, extraUserData: extra };

      // Try media-assets first
      let mediaUrl: string | null = null;
      let canonicalId: string | null = assetRef;
      try {
        const resp = await fetch(`/api/media-assets/${encodeURIComponent(assetRef)}`);
        if (resp.ok) {
          const data = await resp.json();
          const asset = data?.asset || data;
          canonicalId = asset?.id || assetRef;
          const originalUrl: string | null = asset?.cloudflare_url || asset?.url || asset?.s3_url || null;
          if (originalUrl) mediaUrl = (type === 'image' || type === 'video') ? `/api/proxy?url=${encodeURIComponent(originalUrl)}` : originalUrl;
          // capture intrinsic dimensions if available
          const meta = asset?.metadata || {};
          if (typeof meta.width === 'number' && typeof meta.height === 'number') {
            extra.mediaWidth = meta.width;
            extra.mediaHeight = meta.height;
          }
        }
      } catch {}

      // Fallback: batch resolver by identifier
      if (!mediaUrl) {
        try {
          const resp2 = await fetch('/api/tools/resolveAssetRefs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifiers: [assetRef], preferred: 'cloudflare' })
          });
          if (resp2.ok) {
            const j = await resp2.json();
            const url = Array.isArray(j?.refs) && j.refs[0] ? String(j.refs[0]) : undefined;
            if (url) mediaUrl = (type === 'image' || type === 'video') ? `/api/proxy?url=${encodeURIComponent(url)}` : url;
          }
        } catch {}
      }

      return { mediaUrl: mediaUrl || null, assetId: canonicalId, extraUserData: extra };
    } catch {
      return { mediaUrl: null, assetId: null };
    }
  };

  const addLayoutToEditor = async (layout: any) => {
    const items = layout?.layout_data?.items || [];
    const scale = 0.1; // Increased scale for better visibility
    const spacing = 3; // Space between items

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      // Prefer contentType; fallback to type; then normalize to our schema union
      const rawType: string = (item.contentType || item.type || 'unknown').toLowerCase();
      const normalizeType = (t: string): string => {
        if (!t) return 'object';
        switch (t) {
          case 'image':
          case 'image_ref':
            return 'image';
          case 'video':
          case 'video_ref':
            return 'video';
          case 'audio':
          case 'music':
          case 'audio_ref':
          case 'music_ref':
            return 'audio';
          case 'text':
          case 'text_ref':
          case 'content_ref':
            return 'text';
          case 'canvas':
            return 'canvas';
          case 'layout':
          case 'layout_reference':
            return 'layout';
          default:
            return 'object';
        }
      };
      const type = normalizeType(rawType);
      const isPlane = type === 'image' || type === 'video';
      const geometry = isPlane
        ? { type: 'PlaneGeometry', width: 1, height: 1 }
        : { type: 'BoxGeometry', width: 1, height: 1, depth: 1 };
      const color = type === 'image' ? 0x3b82f6 : type === 'video' ? 0xef4444 : 0x8b5cf6;

      // Use layout coordinates if available, otherwise space them out
      const x = item.x !== undefined ? (item.x * scale) : (i * spacing);
      const z = item.y !== undefined ? (item.y * scale) : 0;
      const boxW = item.w ? Math.max(item.w * scale, 0.5) : 1;
      const boxH = item.h ? Math.max(item.h * scale, 0.5) : 1;

      console.log(`[SpaceEditor] Layout item ${i}: x=${x}, z=${z}, width=${boxW}, height=${boxH}`);

      // Resolve media URL and canonical asset id for proper rendering
      const resolved = await resolveLayoutMedia(item, type);

      // Skip non-media layout objects that would create empty white boxes
      if (type === 'object' && !resolved.mediaUrl) {
        console.log('[SpaceEditor] Skipping layout object without media:', item.id || item.contentId || item.refId);
        continue;
      }

      // Fit media into layout box while preserving aspect ratio when we know intrinsic size
      const mediaW = resolved.extraUserData?.mediaWidth as number | undefined;
      const mediaH = resolved.extraUserData?.mediaHeight as number | undefined;
      const fitWithin = (mw?: number, mh?: number, bw: number = 1, bh: number = 1) => {
        if (!mw || !mh || mw <= 0 || mh <= 0) return { w: bw, h: bh };
        const mediaAR = mw / mh;
        const boxAR = bw / bh;
        if (mediaAR >= boxAR) {
          return { w: bw, h: bw / mediaAR };
        } else {
          return { w: bh * mediaAR, h: bh };
        }
      };
      const fitted = isPlane ? fitWithin(mediaW, mediaH, boxW, boxH) : { w: boxW, h: boxH };

      await sendCommand({
        type: 'add_object',
        data: {
          type: 'Mesh',
          geometry,
          material: { type: 'MeshBasicMaterial', color },
          position: [x, 0.5, z],
          scale: [fitted.w, fitted.h, 1],
          name: item.snippet || `Layout Item ${i + 1}`,
          userData: {
            // Persist normalized media type from the layout so save/load can render correctly
            assetType: type,
            sourceType: 'layout',
            layoutId: layout.id,
            layoutItemId: item.id,
            contentType: type,
            mediaUrl: resolved.mediaUrl,
            assetId: resolved.assetId || undefined,
            mediaWidth: mediaW,
            mediaHeight: mediaH,
            ...resolved.extraUserData,
            importMetadata: {
              sourceType: 'layout',
              sourceId: layout.id,
              originalLayoutItem: item
            }
          }
        }
      });
    }
  };

  // Save current scene
  const saveScene = async () => {
    console.log('[SpaceEditor] Save requested, spaceData:', spaceData);

    if (!spaceData) {
      const errorMsg = 'No space data loaded';
      console.error('[SpaceEditor]', errorMsg);
      setError(errorMsg);
      onError?.(errorMsg);
      return;
    }

    try {
      console.log('[SpaceEditor] Starting scene save...');
      pendingSaveRef.current = true;
      // Request scene export from editor and use the response payload
      const exportedScene = await sendCommand({
        type: 'export_scene',
        data: {},
      });
      console.log('[SpaceEditor] Export command sent, waiting for response...');

      // If bridge resolves with scene payload, proceed to save immediately
      if (exportedScene) {
        console.log('[SpaceEditor] Export resolved via command promise');
        pendingSaveRef.current = false;
        await handleSceneExport(exportedScene);
        return;
      }

      // Note: If no payload returned (queued pre-ready), onMessage handler will catch when delivered
    } catch (err) {
      pendingSaveRef.current = false;
      const errorMsg = err instanceof Error ? err.message : 'Failed to save scene';
      console.error('[SpaceEditor] Save error:', err);
      setError(errorMsg);
      onError?.(errorMsg);
    }
  };

  // Handle scene export response and save to API
  const handleSceneExport = async (exportedScene: any) => {
    console.log('[SpaceEditor] handleSceneExport called, spaceData:', spaceData);

    if (!spaceData) {
      console.error('[SpaceEditor] No spaceData available for save');
      setError('No space data available for save');
      onError?.('No space data available for save');
      return;
    }

    try {
      console.log('[SpaceEditor] Converting exported scene to space format...');
      // Convert Three.js scene back to SpaceAsset format
      const updatedSpace = convertThreeJSSceneToSpace(exportedScene, spaceData);
      console.log('[SpaceEditor] Converted space:', updatedSpace);

      // Save to API
      console.log('[SpaceEditor] Saving to API...');
      const response = await fetch(`/api/spaces/${spaceId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedSpace),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to save space: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const savedSpace = await response.json();
      console.log('[SpaceEditor] API response:', savedSpace);

      setSpaceData(savedSpace);
      onSceneChange?.(savedSpace);

      console.log('[SpaceEditor] Space saved successfully');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to save space';
      console.error('[SpaceEditor] Save error:', err);
      setError(errorMsg);
      onError?.(errorMsg);
    }
  };

  // Expose methods to parent component (placed after function declarations)
  useImperativeHandle(ref, () => ({
    saveScene: async () => { await saveScene(); },
    loadSpace: async (sd: any) => { await loadSpace(sd); },
    addAsset: async (asset: any) => { await addAssetToEditor(asset); },
    addLayout: async (layout: any) => { await addLayoutToEditor(layout); },
    sendCommand: async (command: any) => { await sendCommand(command); }
  }), [saveScene, loadSpace, addAssetToEditor, addLayoutToEditor, sendCommand]);

  if (error) {
    return (
      <div className="h-[calc(100vh-200px)] bg-red-900/20 border border-red-700 rounded-lg flex items-center justify-center">
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
    <div className="relative" style={{ border: 'none', outline: 'none' }}>
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
        className="w-full h-[calc(100vh-200px)]"
        title="Three.js Editor"
        sandbox="allow-scripts allow-same-origin allow-forms"
        style={{
          opacity: loading ? 0.3 : 1,
          transition: 'opacity 0.3s ease-in-out',
          border: 'none',
          outline: 'none',
          boxShadow: 'none',
          colorScheme: 'dark'
        }}
      />



      {/* Status Indicator */}
      <div className="absolute bottom-3 left-3 text-xs text-neutral-300">
        {loading ? 'Loading...' : editorReady ? 'Editor Ready' : 'Initializing...'}
      </div>
    </div>
  );
});

SpaceEditor.displayName = 'SpaceEditor';

export default SpaceEditor;
