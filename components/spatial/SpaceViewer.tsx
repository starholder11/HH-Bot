"use client";
import { useEffect, useMemo, useState } from "react";

type CameraMode = "orbit" | "first-person" | "fly";

export type SpaceViewerProps = {
  spaceId?: string;
  cameraMode: CameraMode;
  backgroundColor?: string;
};

export default function SpaceViewer(props: SpaceViewerProps) {
  const { cameraMode, backgroundColor = "#111217" } = props;
  const [r3f, setR3F] = useState<any>(null);

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

  const { Canvas, OrbitControls, FlyControls, PointerLockControls, Environment, StatsGl } = r3f;

  return (
    <div className="relative">
      <Canvas style={{ height: 480, width: "100%", background: backgroundColor }} camera={{ position: [4, 3, 6], fov: 50 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 8, 5]} intensity={0.9} />

        {/* Simple floor for reference */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
          <planeGeometry args={[100, 100]} />
          <meshStandardMaterial color="#1f2430" />
        </mesh>

        {/* Controls per camera mode */}
        {cameraMode === "orbit" && <OrbitControls enablePan enableZoom enableRotate />}
        {cameraMode === "fly" && <FlyControls movementSpeed={5} rollSpeed={0.3} dragToLook />} 
        {cameraMode === "first-person" && <PointerLockControls />}

        {/* Optional helpers */}
        <gridHelper args={[20, 20, "#666", "#333"]} />
        <axesHelper args={[2]} />
        <Environment preset="city" />
        <StatsGl />
      </Canvas>

      <div className="absolute bottom-3 left-3 rounded bg-black/60 px-2 py-1 text-xs text-neutral-200">
        {overlayHint}
      </div>
    </div>
  );
}


