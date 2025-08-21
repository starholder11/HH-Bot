"use client";
import { useEffect, useMemo, useState, useRef } from "react";
import SpaceScene, { generateDemoSpaceItems } from "./SpaceScene";
import { type SpaceAssetData } from "@/hooks/useSpaceAsset";
import { usePerformanceMonitor, PerformanceMonitor } from "@/hooks/usePerformanceMonitor";
import { LODManager } from "@/utils/spatial/lod";
import { globalMemoryManager } from "@/utils/spatial/memory-management";

type CameraMode = "orbit" | "first-person" | "fly";

export type SpaceViewerProps = {
  spaceId?: string;
  cameraMode: CameraMode;
  backgroundColor?: string;
  items?: SpaceAssetData[];
};

export default function SpaceViewer(props: SpaceViewerProps) {
  const { cameraMode, backgroundColor = "#111217", items } = props;
  const [r3f, setR3F] = useState<any>(null);
  const [cameraPosition, setCameraPosition] = useState<[number, number, number]>([4, 3, 6]);
  const cameraRef = useRef<any>(null);
  const rendererRef = useRef<any>(null);
  const lodManagerRef = useRef<LODManager>(new LODManager());
  
  // Performance monitoring
  const { metrics, isPerformanceAcceptable } = usePerformanceMonitor(rendererRef.current);

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
          OrbitControls: drei.OrbitControls,
          FlyControls: drei.FlyControls,
          PointerLockControls: drei.PointerLockControls,
          Environment: drei.Environment,
          StatsGl: drei.StatsGl,
        });
      } catch (err) {
        console.error("SpaceViewer failed to load R3F:", err);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  // Use demo items if none provided
  const spaceItems = useMemo(() => {
    return items || generateDemoSpaceItems();
  }, [items]);

  // Memory cleanup on unmount
  useEffect(() => {
    return () => {
      globalMemoryManager.cleanup();
    };
  }, []);

  const overlayHint = useMemo(() => {
    if (cameraMode === "first-person") {
      return "Click the canvas to lock pointer. ESC to unlock.";
    }
    if (cameraMode === "fly") {
      return "Use WASD + mouse to fly. R/F = up/down.";
    }
    return "Drag to orbit. Scroll to zoom.";
  }, [cameraMode]);

  if (!r3f) {
    return (
      <div className="h-[480px] flex items-center justify-center rounded-md border border-neutral-700 bg-neutral-800 text-neutral-300">
        Loading SpaceViewer…
      </div>
    );
  }

  const { Canvas, useFrame, OrbitControls, FlyControls, PointerLockControls, Environment, StatsGl } = r3f;

  // Camera tracking and performance optimization component
  function CameraTracker() {
    useFrame((state) => {
      if (cameraRef.current) {
        setCameraPosition([
          state.camera.position.x,
          state.camera.position.y,
          state.camera.position.z,
        ]);

        // Update LOD manager
        lodManagerRef.current.updateFrustum(state.camera);
      }

      // Update memory manager
      globalMemoryManager.update();
      
      // Store renderer reference for performance monitoring
      if (state.gl && !rendererRef.current) {
        rendererRef.current = state.gl;
      }
    });
    return null;
  }

  return (
    <div className="relative">
      <Canvas 
        ref={cameraRef}
        style={{ height: 480, width: "100%", background: backgroundColor }} 
        camera={{ position: [4, 3, 6], fov: 50 }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 8, 5]} intensity={0.9} />

        {/* Simple floor for reference */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
          <planeGeometry args={[100, 100]} />
          <meshStandardMaterial color="#1f2430" />
        </mesh>

        {/* Space scene with items */}
        <SpaceScene 
          items={spaceItems} 
          cameraPosition={cameraPosition}
          lodManager={lodManagerRef.current}
          onSelectItem={(item) => console.log('Selected:', item)}
          onHoverItem={(item) => console.log('Hovered:', item)}
        />

        {/* Controls per camera mode */}
        {cameraMode === "orbit" && <OrbitControls enablePan enableZoom enableRotate />}
        {cameraMode === "fly" && <FlyControls movementSpeed={5} rollSpeed={0.3} dragToLook />}
        {cameraMode === "first-person" && <PointerLockControls />}

        {/* Optional helpers */}
        <gridHelper args={[20, 20, "#666", "#333"]} />
        <axesHelper args={[2]} />
        <Environment preset="city" />
        <StatsGl />
        <CameraTracker />
      </Canvas>

      <div className="absolute bottom-3 left-3 rounded bg-black/60 px-2 py-1 text-xs text-neutral-200">
        {overlayHint}
      </div>

      {/* Performance Monitor */}
      <PerformanceMonitor renderer={rendererRef.current} position="top-right" compact={true} />
      
      {/* Performance Warning */}
      {!isPerformanceAcceptable() && (
        <div className="absolute top-3 left-1/2 transform -translate-x-1/2 bg-red-600/90 text-white px-3 py-1 rounded text-sm">
          ⚠ Performance Warning: {metrics.fps.toFixed(1)} FPS
        </div>
      )}
    </div>
  );
}


