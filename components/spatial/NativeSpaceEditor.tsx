"use client";
import { useEffect, useState, useRef } from "react";
import SpaceViewer from "./SpaceViewer";
import { generateDemoSpaceItems } from "./SpaceScene";
import { type SpaceAssetData } from "@/hooks/useSpaceAsset";

export interface NativeSpaceEditorProps {
  spaceId: string;
  onSceneChange?: (sceneData: any) => void;
  onSelectionChange?: (selectedObjects: string[]) => void;
}

export default function NativeSpaceEditor({
  spaceId,
  onSceneChange,
  onSelectionChange,
}: NativeSpaceEditorProps) {
  const [r3f, setR3F] = useState<any>(null);
  const [selectedObjects, setSelectedObjects] = useState<Set<string>>(new Set());
  const [transformMode, setTransformMode] = useState<'translate' | 'rotate' | 'scale'>('translate');
  const [spaceItems, setSpaceItems] = useState<SpaceAssetData[]>([]);
  const [showTransformControls, setShowTransformControls] = useState(true);

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
        });
      } catch (err) {
        console.error("NativeSpaceEditor failed to load R3F:", err);
      }
    };
    load();
    return () => { mounted = false; };
  }, []);

  // Load space items (demo for now)
  useEffect(() => {
    setSpaceItems(generateDemoSpaceItems());
  }, [spaceId]);

  const handleObjectSelect = (item: SpaceAssetData) => {
    const newSelection = new Set(selectedObjects);
    if (newSelection.has(item.id)) {
      newSelection.delete(item.id);
    } else {
      newSelection.add(item.id);
    }
    setSelectedObjects(newSelection);
    onSelectionChange?.(Array.from(newSelection));
  };

  const handleTransform = (objectId: string, transform: any) => {
    // Update item transform
    setSpaceItems(prev => prev.map(item => 
      item.id === objectId 
        ? { ...item, position: transform.position, rotation: transform.rotation, scale: transform.scale }
        : item
    ));
    
    onSceneChange?.({ type: 'object_transformed', objectId, transform });
  };

  const clearSelection = () => {
    setSelectedObjects(new Set());
    onSelectionChange?.([]);
  };

  const selectAll = () => {
    const allIds = new Set(spaceItems.map(item => item.id));
    setSelectedObjects(allIds);
    onSelectionChange?.(Array.from(allIds));
  };

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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
              Keyboard: G (move), R (rotate), S (scale)
            </div>
          </div>

          {/* Selection Controls */}
          <div>
            <label className="block text-sm text-neutral-300 mb-2">Selection</label>
            <div className="flex gap-1">
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
          </div>

          {/* View Controls */}
          <div>
            <label className="block text-sm text-neutral-300 mb-2">Controls</label>
            <div className="flex gap-1">
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
            </div>
          </div>
        </div>
      </div>

      {/* 3D Editor Viewport */}
      <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-4">
        <Canvas 
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

          {/* Render space items with transform controls */}
          {spaceItems.map((item) => (
            <group key={item.id}>
              {/* Basic item representation */}
              <mesh
                position={item.position}
                rotation={item.rotation}
                scale={item.scale}
                onClick={() => handleObjectSelect(item)}
              >
                <boxGeometry args={[1, 1, 1]} />
                <meshStandardMaterial 
                  color={selectedObjects.has(item.id) ? "#4ade80" : "#6b7280"}
                  wireframe={!selectedObjects.has(item.id)}
                />
              </mesh>

              {/* Transform controls for selected objects */}
              {selectedObjects.has(item.id) && showTransformControls && (
                <TransformControls
                  mode={transformMode}
                  onObjectChange={(e: any) => {
                    if (e?.target) {
                      handleTransform(item.id, {
                        position: [e.target.position.x, e.target.position.y, e.target.position.z],
                        rotation: [e.target.rotation.x, e.target.rotation.y, e.target.rotation.z],
                        scale: [e.target.scale.x, e.target.scale.y, e.target.scale.z],
                      });
                    }
                  }}
                />
              )}
            </group>
          ))}

          <OrbitControls enablePan enableZoom enableRotate />
          <gridHelper args={[20, 20, "#666", "#333"]} />
          <axesHelper args={[2]} />
          <Environment preset="city" />
          <StatsGl />
        </Canvas>
      </div>

      {/* Instructions */}
      <div className="text-xs text-neutral-400 bg-neutral-800 border border-neutral-700 rounded-lg p-3">
        <p><strong>Instructions:</strong></p>
        <ul className="list-disc list-inside space-y-1 mt-1">
          <li>Click objects to select/deselect them</li>
          <li>Use transform mode buttons or keyboard shortcuts (G/R/S)</li>
          <li>Drag transform gizmos to move/rotate/scale selected objects</li>
          <li>Changes are automatically saved to the space asset</li>
        </ul>
      </div>
    </div>
  );
}
