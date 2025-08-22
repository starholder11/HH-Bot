"use client";
import { useEffect, useState, useRef, useCallback, forwardRef, useImperativeHandle } from "react";
import SpaceViewer from "./SpaceViewer";
import { generateDemoSpaceItems } from "./SpaceScene";
import { type SpaceAssetData } from "@/hooks/useSpaceAsset";
import SpaceItem from "./SpaceItem";
import ObjectRenderer from "./ObjectRenderer";
import CollectionRenderer from "./CollectionRenderer";
import PropertiesPanel from "./PropertiesPanel";
import { getDefaultEnvironment, getDefaultCamera } from "@/utils/spatial/leva-store";
import AssetImportModal from "./AssetImportModal";
import LayoutImportModal from "./LayoutImportModal";
import type { LayoutAsset } from "@/app/visual-search/types";
import { getResultMediaUrl } from "@/app/visual-search/utils/mediaUrl";

// Helper component for rendering images as textured planes
function ImagePlane({ url }: { url: string }) {
  const [texture, setTexture] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log('[ImagePlane] Loading texture from URL:', url);

    if (typeof window !== 'undefined' && (window as any).THREE) {
      const loader = new (window as any).THREE.TextureLoader();
      setLoading(true);
      setError(null);

      // Add CORS handling
      loader.crossOrigin = 'anonymous';

      loader.load(
        url,
        (loadedTexture: any) => {
          console.log('[ImagePlane] Texture loaded successfully:', loadedTexture);
          loadedTexture.flipY = false; // Fix texture orientation
          setTexture(loadedTexture);
          setLoading(false);
        },
        (progress: any) => {
          console.log('[ImagePlane] Loading progress:', progress);
        },
        (error: any) => {
          console.error('[ImagePlane] Failed to load texture from:', url, error);
          setError(error.message || 'Failed to load image');
          setLoading(false);
        }
      );
    }
  }, [url]);

  if (loading) {
    return (
      <mesh>
        <planeGeometry args={[3, 2]} />
        <meshStandardMaterial color="#444" />
        {/* Loading text */}
        <mesh position={[0, 0, 0.01]}>
          <planeGeometry args={[2, 0.5]} />
          <meshBasicMaterial color="#fff" transparent opacity={0.8} />
        </mesh>
      </mesh>
    );
  }

  if (error || !texture) {
    return (
      <mesh>
        <planeGeometry args={[3, 2]} />
        <meshStandardMaterial color="#ff4444" />
        {/* Error indicator */}
        <mesh position={[0, 0, 0.01]}>
          <planeGeometry args={[2.5, 0.5]} />
          <meshBasicMaterial color="#fff" transparent opacity={0.9} />
        </mesh>
      </mesh>
    );
  }

  return (
    <mesh>
      <planeGeometry args={[3, 2]} />
      <meshStandardMaterial
        map={texture}
        transparent={false}
        side={(window as any).THREE?.DoubleSide || 2}
      />
    </mesh>
  );
}

export interface NativeSpaceEditorProps {
  spaceId: string;
  onSceneChange?: (sceneData: any) => void;
  onSelectionChange?: (selectedObjects: string[]) => void;
}

export interface NativeSpaceEditorHandle {
  saveSpace: () => Promise<any>;
}

export default forwardRef<NativeSpaceEditorHandle, NativeSpaceEditorProps>(function NativeSpaceEditor({
  spaceId,
  onSceneChange,
  onSelectionChange,
}: NativeSpaceEditorProps, ref) {
  const [r3f, setR3F] = useState<any>(null);
  const [selectedObjects, setSelectedObjects] = useState<Set<string>>(new Set());
  const [transformMode, setTransformMode] = useState<'translate' | 'rotate' | 'scale'>('translate');
  const [spaceItems, setSpaceItems] = useState<SpaceAssetData[]>([]);
  const [showTransformControls, setShowTransformControls] = useState(true);
  const [selectionMode, setSelectionMode] = useState<'single' | 'multi'>('single');
  const [interactionLevel, setInteractionLevel] = useState<'object' | 'component' | 'collection'>('object');
  const [environment, setEnvironment] = useState(getDefaultEnvironment());
  const [cameraSettings, setCameraSettings] = useState(getDefaultCamera());
  const [showPropertiesPanel, setShowPropertiesPanel] = useState(true);
  const [showAssetImportModal, setShowAssetImportModal] = useState(false);
  const [showLayoutImportModal, setShowLayoutImportModal] = useState(false);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [isTransforming, setIsTransforming] = useState(false);
  const [primarySelectedId, setPrimarySelectedId] = useState<string | null>(null);
  const canvasRef = useRef<any>(null);
  const transformControlsRef = useRef<any>(null);
  const orbitRef = useRef<any>(null);

  // Load R3F dependencies
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
          Canvas: fiber.Canvas,
          useFrame: fiber.useFrame,
          TransformControls: drei.TransformControls,
          OrbitControls: drei.OrbitControls,
          Environment: drei.Environment,
          StatsGl: drei.StatsGl,
          Text: drei.Text,
          Image: (drei as any).Image,
        });
      } catch (err) {
        console.error("NativeSpaceEditor failed to load R3F:", err);
      }
    };
    load();
    return () => { mounted = false; };
  }, []);

  // Load space data from API
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/spaces/${spaceId}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`Failed to load space ${spaceId}`);
        const space = await res.json();
        if (cancelled) return;

        // Safely extract data with proper defaults
        const items = Array.isArray(space?.space?.items) ? space.space.items : [];
        const defaultEnv = getDefaultEnvironment();
        const defaultCam = getDefaultCamera();

        // Merge with defaults to ensure all required properties exist
        const env = {
          ...defaultEnv,
          ...(space?.space?.environment || {})
        };
        const cam = {
          ...defaultCam,
          ...(space?.space?.camera || {})
        };

        console.log('[NativeSpaceEditor] Loaded space:', { items: items.length, env, cam });
        setSpaceItems(items);
        setEnvironment(env);
        setCameraSettings(cam);
        setIsDataLoaded(true);
      } catch (e) {
        console.error('[NativeSpaceEditor] Failed to load space:', e);
        // Use demo data as fallback
        setSpaceItems(generateDemoSpaceItems());
        setEnvironment(getDefaultEnvironment());
        setCameraSettings(getDefaultCamera());
        setIsDataLoaded(true);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [spaceId]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if not in input field
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'g':
          e.preventDefault();
          setTransformMode('translate');
          break;
        case 'r':
          e.preventDefault();
          setTransformMode('rotate');
          break;
        case 's':
          e.preventDefault();
          setTransformMode('scale');
          break;
        case 'escape':
          e.preventDefault();
          clearSelection();
          break;
        case 'a':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            selectAll();
          }
          break;
        case 'delete':
        case 'backspace':
          e.preventDefault();
          deleteSelected();
          break;
        case 'tab':
          e.preventDefault();
          setSelectionMode(prev => prev === 'single' ? 'multi' : 'single');
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleObjectSelect = useCallback((item: SpaceAssetData, addToSelection: boolean = false) => {
    const newSelection = new Set(selectedObjects);

    if (selectionMode === 'single' && !addToSelection) {
      // Single selection mode - replace selection
      newSelection.clear();
      newSelection.add(item.id);
      setPrimarySelectedId(item.id);
    } else {
      // Multi selection mode or additive selection
      if (newSelection.has(item.id)) {
        newSelection.delete(item.id);
        // If we removed the primary, pick a new one
        if (primarySelectedId === item.id) {
          const remaining = Array.from(newSelection);
          setPrimarySelectedId(remaining.length > 0 ? remaining[0] : null);
        }
      } else {
        newSelection.add(item.id);
        // If no primary or this is the first selection, make it primary
        if (!primarySelectedId || newSelection.size === 1) {
          setPrimarySelectedId(item.id);
        }
      }
    }

    setSelectedObjects(newSelection);
    onSelectionChange?.(Array.from(newSelection));
  }, [selectedObjects, selectionMode, onSelectionChange]);

  const handleTransform = (objectId: string, transform: any) => {
    // Update item transform
    setSpaceItems(prev => prev.map(item =>
      item.id === objectId
        ? { ...item, position: transform.position, rotation: transform.rotation, scale: transform.scale }
        : item
    ));

    onSceneChange?.({ type: 'object_transformed', objectId, transform });
  };

  const clearSelection = useCallback(() => {
    setSelectedObjects(new Set());
    setPrimarySelectedId(null);
    setTransformTarget(null);
    onSelectionChange?.([]);
  }, [onSelectionChange]);

  const selectAll = useCallback(() => {
    const allIds = new Set(spaceItems.map(item => item.id));
    setSelectedObjects(allIds);
    onSelectionChange?.(Array.from(allIds));
  }, [spaceItems, onSelectionChange]);

  const deleteSelected = useCallback(() => {
    if (selectedObjects.size === 0) return;

    setSpaceItems(prev => prev.filter(item => !selectedObjects.has(item.id)));
    setSelectedObjects(new Set());
    onSelectionChange?.([]);
    onSceneChange?.({ type: 'objects_deleted', objectIds: Array.from(selectedObjects) });
  }, [selectedObjects, onSelectionChange, onSceneChange]);

  const duplicateSelected = useCallback(() => {
    if (selectedObjects.size === 0) return;

    const selectedItems = spaceItems.filter(item => selectedObjects.has(item.id));
    const duplicatedItems = selectedItems.map(item => ({
      ...item,
      id: `${item.id}_copy_${Date.now()}`,
      position: [item.position[0] + 1, item.position[1], item.position[2]] as [number, number, number]
    }));

    setSpaceItems(prev => [...prev, ...duplicatedItems]);

    // Select the duplicated items
    const newSelection = new Set(duplicatedItems.map(item => item.id));
    setSelectedObjects(newSelection);
    onSelectionChange?.(Array.from(newSelection));
    onSceneChange?.({ type: 'objects_duplicated', originalIds: Array.from(selectedObjects), newIds: Array.from(newSelection) });
  }, [selectedObjects, spaceItems, onSelectionChange, onSceneChange]);

  const groupSelected = useCallback(() => {
    if (selectedObjects.size < 2) return;

    const selectedItems = spaceItems.filter(item => selectedObjects.has(item.id));
    const groupId = `group_${Date.now()}`;

    // Calculate group center
    const center = selectedItems.reduce(
      (acc, item) => {
        acc.x += item.position[0];
        acc.y += item.position[1];
        acc.z += item.position[2];
        return acc;
      },
      { x: 0, y: 0, z: 0 }
    );
    center.x /= selectedItems.length;
    center.y /= selectedItems.length;
    center.z /= selectedItems.length;

    // Update items with group reference
    setSpaceItems(prev => prev.map(item =>
      selectedObjects.has(item.id)
        ? { ...item, groupId }
        : item
    ));

    onSceneChange?.({ type: 'objects_grouped', groupId, objectIds: Array.from(selectedObjects) });
  }, [selectedObjects, spaceItems, onSceneChange]);

  // Properties panel handlers
  const handleEnvironmentChange = useCallback((key: string, value: any) => {
    setEnvironment(prev => {
      const newEnv = { ...prev };
      if (key.includes('.')) {
        const [parentKey, childKey] = key.split('.');
        newEnv[parentKey as keyof typeof newEnv] = {
          ...newEnv[parentKey as keyof typeof newEnv],
          [childKey]: value
        };
      } else {
        newEnv[key as keyof typeof newEnv] = value;
      }
      return newEnv;
    });
    onSceneChange?.({ type: 'environment_changed', key, value });
  }, [onSceneChange]);

  const handleCameraChange = useCallback((key: string, value: any) => {
    setCameraSettings(prev => ({
      ...prev,
      [key]: value
    }));
    onSceneChange?.({ type: 'camera_changed', key, value });
  }, [onSceneChange]);

  const handleObjectPropertyChange = useCallback((objectId: string, key: string, value: any) => {
    setSpaceItems(prev => prev.map(item => {
      if (item.id !== objectId) return item;

      const newItem = { ...item };
      if (key.includes('.')) {
        const [parentKey, childKey] = key.split('.');
        newItem[parentKey as keyof typeof newItem] = {
          ...newItem[parentKey as keyof typeof newItem],
          [childKey]: value
        };
      } else {
        newItem[key as keyof typeof newItem] = value;
      }
      return newItem;
    }));
    onSceneChange?.({ type: 'object_property_changed', objectId, key, value });
  }, [onSceneChange]);

    const handleImportAsset = useCallback(() => {
    setShowAssetImportModal(true);
  }, []);

  const handleImportLayout = useCallback(() => {
    setShowLayoutImportModal(true);
  }, []);

  const handleAssetSelect = useCallback((asset: any) => {
    console.log('[NATIVE EDITOR] Selected asset for import:', asset);

    // Create a new space item from the selected asset
    const mediaUrl = getResultMediaUrl(asset as any) || asset.cloudflare_url || asset.url || asset.s3_url;
    const assetType = (asset.content_type || asset.type || 'unknown').toLowerCase();

    console.log('[NATIVE EDITOR] Asset details:', {
      title: asset.title,
      assetType,
      mediaUrl,
      hasCloudflareUrl: !!asset.cloudflare_url,
      hasUrl: !!asset.url,
      hasS3Url: !!asset.s3_url
    });

    const newItem: SpaceAssetData = {
      id: `asset-${Date.now()}`,
      type: 'asset_reference',
      title: asset.title || asset.filename || 'Imported Asset',
      position: [Math.random() * 4 - 2, 1, Math.random() * 4 - 2], // Random position
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      assetId: asset.id,
      assetType,
      mediaUrl,
      metadata: {
        originalAsset: asset,
        importedAt: new Date().toISOString(),
      }
    };

    setSpaceItems(prev => [...prev, newItem]);
    setShowAssetImportModal(false);
    onSceneChange?.({ type: 'asset_imported', asset: newItem });
  }, [onSceneChange]);

  const handleLayoutSelect = useCallback((layout: LayoutAsset) => {
    console.log('[NATIVE EDITOR] Selected layout for import:', layout);

    // Convert layout items to space items
    const layoutItems = layout.layout_data?.items || [];
    const newSpaceItems: SpaceAssetData[] = layoutItems.map((item, index) => ({
      id: `layout-item-${Date.now()}-${index}`,
      type: 'layout_reference',
      title: item.snippet || `Layout Item ${index + 1}`,
      position: [
        (item.x || 0) * 0.02, // Better scale for 3D space
        0.5, // Lift off ground
        (item.y || 0) * 0.02
      ],
      rotation: [0, 0, 0],
      scale: [
        Math.max((item.w || 100) * 0.02, 1), // Minimum scale of 1
        1,
        Math.max((item.h || 100) * 0.02, 1)
      ],
      layoutItemId: item.id,
      layoutId: layout.id,
      assetType: item.type || 'unknown',
      mediaUrl: item.mediaUrl,
      metadata: {
        originalLayoutItem: item,
        originalLayout: {
          id: layout.id,
          title: layout.title
        },
        importedAt: new Date().toISOString(),
      }
    }));

    setSpaceItems(prev => [...prev, ...newSpaceItems]);
    setShowLayoutImportModal(false);
    onSceneChange?.({ type: 'layout_imported', layout, items: newSpaceItems });
  }, [onSceneChange]);

  // Expose saveSpace() via ref
  useImperativeHandle(ref, () => ({
    async saveSpace() {
      // Fetch latest space to preserve metadata
      const res = await fetch(`/api/spaces/${spaceId}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed to load space ${spaceId} for save`);
      const existing = await res.json();

      const updated = {
        ...existing,
        space: {
          ...(existing.space || {}),
          items: spaceItems,
          environment,
          camera: cameraSettings,
        },
        updated_at: new Date().toISOString(),
      };

      const put = await fetch(`/api/spaces/${spaceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      if (!put.ok) throw new Error(`Failed to save space ${spaceId}: ${put.status}`);
      const saved = await put.json();
      // Inform parent with full space object so it can refresh state
      onSceneChange?.(saved);
      return saved;
    },
  }), [spaceId, spaceItems, environment, cameraSettings, onSceneChange]);

  const handleAction = useCallback((action: string, data?: any) => {
    switch (action) {
      case 'resetCamera':
        setCameraSettings(getDefaultCamera());
        break;
      case 'resetEnvironment':
        setEnvironment(getDefaultEnvironment());
        break;
      case 'exportScene':
        const sceneData = {
          environment,
          camera: cameraSettings,
          items: spaceItems,
          selectedObjects: Array.from(selectedObjects),
        };
        onSceneChange?.({ type: 'scene_exported', data: sceneData });
        // Could also trigger download
        const blob = new Blob([JSON.stringify(sceneData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `space-${spaceId}-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        break;
      case 'clearScene':
        if (confirm('Are you sure you want to clear the scene? This action cannot be undone.')) {
          setSpaceItems([]);
          setSelectedObjects(new Set());
          onSelectionChange?.([]);
          onSceneChange?.({ type: 'scene_cleared' });
        }
        break;
      case 'importAsset':
        handleImportAsset();
        break;
      case 'importLayout':
        handleImportLayout();
        break;
      default:
        onSceneChange?.({ type: 'action_triggered', action, data });
    }
  }, [environment, cameraSettings, spaceItems, selectedObjects, spaceId, onSceneChange, onSelectionChange, handleImportAsset, handleImportLayout]);

  if (!r3f) {
    return (
      <div className="h-[600px] bg-neutral-800 border border-neutral-700 rounded-lg flex items-center justify-center">
        <div className="text-center">
          <div className="text-white text-lg mb-2">Loading Native Editor...</div>
          <div className="text-neutral-300 text-sm">Initializing R3F components</div>
        </div>
      </div>
    );
  }

  const { Canvas, useFrame, TransformControls, OrbitControls, Environment, StatsGl } = r3f;

  // Helper component to render and transform a single space item
  const RenderItem = ({ item }: { item: SpaceAssetData }) => {
    const groupRef = useRef<any>(null);
    const isSelected = selectedObjects.has(item.id);
    const isPrimary = primarySelectedId === item.id;

    const content = (
      <group
        ref={groupRef}
        position={item.position}
        rotation={item.rotation}
        scale={item.scale}
        onClick={(e) => {
          e.stopPropagation();
          handleObjectSelect(item, e.shiftKey || selectionMode === 'multi');
        }}
      >
        {/* Render different asset types */}
        {item.assetType === 'object' && (
          <ObjectRenderer
            assetData={{ /* mock object data */ id: item.assetId, object_type: 'atomic', object: { modelUrl: '/models/reference/threejs/DamagedHelmet.glb', boundingBox: { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] }, category: 'props' } }}
            showComponents={interactionLevel === 'component'}
            interactionLevel={interactionLevel}
            onComponentSelect={(component) => console.log('Component selected:', component)}
            onComponentHover={(component) => console.log('Component hovered:', component)}
          />
        )}

        {item.assetType === 'object_collection' && (
          <CollectionRenderer
            assetData={{ /* mock collection data */ id: item.assetId, collection: { objects: [{ objectId: 'cube-01', transform: { position: [-1, 0, -1], rotation: [0, 0, 0], scale: [0.8, 0.8, 0.8] } }], boundingBox: { min: [-2, 0, -2], max: [2, 1, 2] } } }}
            showComponents={interactionLevel !== 'collection'}
            interactionLevel={interactionLevel}
            useInstancing={true}
            onObjectSelect={(objectId) => console.log('Object selected:', objectId)}
            onObjectHover={(objectId) => console.log('Object hovered:', objectId)}
          />
        )}

        {!['object', 'object_collection'].includes(item.assetType) && (
          // Image/video planes or colored boxes and label
          <>
            {/* Image plane or colored box */}
            {(['image', 'video'].includes(item.assetType) && item.mediaUrl)
              ? (
                r3f?.Image
                  ? (<r3f.Image url={`/api/proxy?url=${encodeURIComponent(item.mediaUrl)}`} scale={[3, 2, 1]} toneMapped={true} transparent={false} />)
                  : (<ImagePlane url={`/api/proxy?url=${encodeURIComponent(item.mediaUrl)}`} />)
              )
              : (
                <mesh>
                  <boxGeometry args={[1, 1, 1]} />
                  <meshStandardMaterial
                    color={
                      item.assetType === 'image' ? "#3b82f6" :
                      item.assetType === 'video' ? "#ef4444" :
                      item.assetType === 'audio' ? "#10b981" :
                      item.assetType === 'text' ? "#f59e0b" :
                      item.assetType === 'layout_reference' ? "#8b5cf6" :
                      "#6b7280"
                    }
                    wireframe={false}
                    transparent
                    opacity={isSelected ? 0.9 : 0.7}
                  />
                </mesh>
              )}

            {r3f?.Text && (
              <r3f.Text
                position={[0, 1.2, 0]}
                fontSize={0.2}
                color={isSelected ? "#4ade80" : "#ffffff"}
                anchorX="center"
                anchorY="middle"
              >
                {item.title || item.assetType}
              </r3f.Text>
            )}
          </>
        )}
      </group>
    );

    if (isPrimary && showTransformControls) {
      return (
        <TransformControls
          ref={transformControlsRef}
          mode={transformMode}
          onObjectChange={() => {
            if (!groupRef.current) return;
            handleTransform(item.id, {
              position: [groupRef.current.position.x, groupRef.current.position.y, groupRef.current.position.z],
              rotation: [groupRef.current.rotation.x, groupRef.current.rotation.y, groupRef.current.rotation.z],
              scale: [groupRef.current.scale.x, groupRef.current.scale.y, groupRef.current.scale.z],
            });
          }}
          onDraggingChanged={(active: boolean) => {
            setIsTransforming(active);
            if (orbitRef.current) orbitRef.current.enabled = !active;
          }}
        >
          {content}
        </TransformControls>
      );
    }

    return content;
  };

  return (
    <div className="space-y-4">
      {/* Editor Controls */}
      <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-white">Native R3F Editor</h3>
          <div className="flex items-center gap-2">
            <span className="text-sm text-neutral-400">
              Selected: {selectedObjects.size} / {spaceItems.length}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Transform Mode */}
          <div>
            <label className="block text-sm text-neutral-300 mb-2">Transform Mode</label>
            <div className="flex gap-1">
              {(['translate', 'rotate', 'scale'] as const).map(mode => (
                <button
                  key={mode}
                  className={`px-3 py-1.5 text-xs rounded ${
                    transformMode === mode
                      ? 'bg-blue-600 text-white'
                      : 'bg-neutral-700 hover:bg-neutral-600 text-neutral-300'
                  }`}
                  onClick={() => setTransformMode(mode)}
                >
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </button>
              ))}
            </div>
            <div className="text-xs text-neutral-400 mt-1">
              G/R/S keys
            </div>
          </div>

          {/* Selection Controls */}
          <div>
            <label className="block text-sm text-neutral-300 mb-2">Selection</label>
            <div className="flex gap-1 mb-1">
              <button
                className="px-3 py-1.5 text-xs rounded bg-neutral-700 hover:bg-neutral-600 text-neutral-300"
                onClick={selectAll}
              >
                All
              </button>
              <button
                className="px-3 py-1.5 text-xs rounded bg-neutral-700 hover:bg-neutral-600 text-neutral-300"
                onClick={clearSelection}
              >
                None
              </button>
            </div>
            <div className="flex gap-1">
              <button
                className={`px-2 py-1 text-xs rounded ${
                  selectionMode === 'single'
                    ? 'bg-purple-600 text-white'
                    : 'bg-neutral-700 hover:bg-neutral-600 text-neutral-300'
                }`}
                onClick={() => setSelectionMode('single')}
              >
                Single
              </button>
              <button
                className={`px-2 py-1 text-xs rounded ${
                  selectionMode === 'multi'
                    ? 'bg-purple-600 text-white'
                    : 'bg-neutral-700 hover:bg-neutral-600 text-neutral-300'
                }`}
                onClick={() => setSelectionMode('multi')}
              >
                Multi
              </button>
            </div>
          </div>

          {/* Object Operations */}
          <div>
            <label className="block text-sm text-neutral-300 mb-2">Operations</label>
            <div className="flex gap-1 mb-1">
              <button
                className="px-3 py-1.5 text-xs rounded bg-neutral-700 hover:bg-neutral-600 text-neutral-300"
                onClick={duplicateSelected}
                disabled={selectedObjects.size === 0}
              >
                Duplicate
              </button>
              <button
                className="px-3 py-1.5 text-xs rounded bg-neutral-700 hover:bg-neutral-600 text-neutral-300"
                onClick={groupSelected}
                disabled={selectedObjects.size < 2}
              >
                Group
              </button>
            </div>
            <div className="flex gap-1">
              <button
                className="px-3 py-1.5 text-xs rounded bg-red-600 hover:bg-red-700 text-white"
                onClick={deleteSelected}
                disabled={selectedObjects.size === 0}
              >
                Delete
              </button>
            </div>
          </div>

          {/* View Controls */}
          <div>
            <label className="block text-sm text-neutral-300 mb-2">View</label>
            <div className="flex gap-1 mb-1">
              <button
                className={`px-3 py-1.5 text-xs rounded ${
                  showTransformControls
                    ? 'bg-green-600 text-white'
                    : 'bg-neutral-700 hover:bg-neutral-600 text-neutral-300'
                }`}
                onClick={() => setShowTransformControls(!showTransformControls)}
              >
                Transform
              </button>
              <button
                className={`px-3 py-1.5 text-xs rounded ${
                  showPropertiesPanel
                    ? 'bg-blue-600 text-white'
                    : 'bg-neutral-700 hover:bg-neutral-600 text-neutral-300'
                }`}
                onClick={() => setShowPropertiesPanel(!showPropertiesPanel)}
              >
                Properties
              </button>
            </div>
            <div className="flex gap-1">
              {(['object', 'component', 'collection'] as const).map(level => (
                <button
                  key={level}
                  className={`px-2 py-1 text-xs rounded ${
                    interactionLevel === level
                      ? 'bg-orange-600 text-white'
                      : 'bg-neutral-700 hover:bg-neutral-600 text-neutral-300'
                  }`}
                  onClick={() => setInteractionLevel(level)}
                >
                  {level.charAt(0).toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Main Editor Layout */}
      <div className={`grid gap-4 ${showPropertiesPanel ? 'grid-cols-1 lg:grid-cols-3' : 'grid-cols-1'}`}>
        {/* 3D Editor Viewport */}
        <div className={`${showPropertiesPanel ? 'lg:col-span-2' : 'col-span-1'} bg-neutral-800 border border-neutral-700 rounded-lg p-4`}>
          <Canvas
          ref={canvasRef}
          style={{ height: 500, width: "100%", background: "#111217" }}
          camera={{ position: [4, 3, 6], fov: 50 }}
        >
          <ambientLight intensity={0.6} />
          <directionalLight position={[5, 8, 5]} intensity={0.9} />

          {/* Floor */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
            <planeGeometry args={[100, 100]} />
            <meshStandardMaterial color="#1f2430" />
          </mesh>

          {/* Render space items with proper asset type support */}
          {spaceItems.map((item) => (
            <RenderItem key={item.id} item={item} />
          ))}

          {/* TransformControls now wrapped per primary item; nothing at canvas level */}

          <OrbitControls
            makeDefault
            ref={orbitRef}
            enablePan
            enableZoom
            enableRotate
            enableDamping
            onStart={() => { if (isTransforming && orbitRef.current) orbitRef.current.enabled = false; }}
          />
          <gridHelper args={[20, 20, "#666", "#333"]} />
          <axesHelper args={[2]} />
          <Environment preset="city" />
          <StatsGl />
          </Canvas>
        </div>

        {/* Properties Panel */}
        {showPropertiesPanel && isDataLoaded && (
          <div className="lg:col-span-1">
            <PropertiesPanel
              selectedObjects={spaceItems.filter(item => selectedObjects.has(item.id))}
              environment={environment}
              camera={cameraSettings}
              onEnvironmentChange={handleEnvironmentChange}
              onCameraChange={handleCameraChange}
              onObjectChange={handleObjectPropertyChange}
              onAction={handleAction}
            />
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="text-xs text-neutral-400 bg-neutral-800 border border-neutral-700 rounded-lg p-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p><strong>Selection:</strong></p>
            <ul className="list-disc list-inside space-y-1 mt-1">
              <li>Click objects to select (Shift+click for multi-select)</li>
              <li>Tab to toggle single/multi selection mode</li>
              <li>Ctrl/Cmd+A to select all, Escape to clear</li>
              <li>Delete/Backspace to remove selected objects</li>
            </ul>
          </div>
          <div>
            <p><strong>Transform:</strong></p>
            <ul className="list-disc list-inside space-y-1 mt-1">
              <li>G (grab/move), R (rotate), S (scale)</li>
              <li>Drag transform gizmos to modify objects</li>
              <li>Object/Component/Collection interaction levels</li>
              <li>Group/Duplicate operations for multi-selection</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Import Modals */}
      {showAssetImportModal && (
        <AssetImportModal
          onClose={() => setShowAssetImportModal(false)}
          onSelect={handleAssetSelect}
        />
      )}

      {showLayoutImportModal && (
        <LayoutImportModal
          onClose={() => setShowLayoutImportModal(false)}
          onSelect={handleLayoutSelect}
        />
      )}
    </div>
  );
});
