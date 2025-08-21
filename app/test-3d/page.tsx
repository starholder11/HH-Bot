"use client";
import { useState, useEffect } from 'react';

export default function Test3DPage() {
  const [mounted, setMounted] = useState(false);
  const [R3FComponents, setR3FComponents] = useState<any>(null);

  useEffect(() => {
    // Load R3F components only on client side
    const loadR3F = async () => {
      try {
        const [fiber, drei] = await Promise.all([
          import('@react-three/fiber'),
          import('@react-three/drei')
        ]);
        
        setR3FComponents({
          Canvas: fiber.Canvas,
          useFrame: fiber.useFrame,
          OrbitControls: drei.OrbitControls
        });
        setMounted(true);
      } catch (error) {
        console.error('Failed to load R3F:', error);
      }
    };
    
    loadR3F();
  }, []);

  if (!mounted || !R3FComponents) {
    return (
      <div className="min-h-screen bg-neutral-900 text-white p-6">
        <h1 className="text-2xl font-bold mb-4">R3F Test</h1>
        <p className="mb-4 text-neutral-300">Testing React Three Fiber installation and basic rendering:</p>
        <div className="border border-neutral-700 rounded-lg overflow-hidden">
          <div className="h-96 flex items-center justify-center text-neutral-400 bg-neutral-800">
            Loading 3D scene...
          </div>
        </div>
        <p className="mt-4 text-sm text-neutral-500">
          If you see an orange rotating cube above, R3F is working correctly!
        </p>
      </div>
    );
  }

  const { Canvas, OrbitControls } = R3FComponents;

  return (
    <div className="min-h-screen bg-neutral-900 text-white p-6">
      <h1 className="text-2xl font-bold mb-4">R3F Test</h1>
      <p className="mb-4 text-neutral-300">Testing React Three Fiber installation and basic rendering:</p>
      <div className="border border-neutral-700 rounded-lg overflow-hidden">
        <Canvas style={{ height: '400px', width: '100%' }} camera={{ position: [3, 3, 3] }}>
          <ambientLight intensity={0.5} />
          <pointLight position={[10, 10, 10]} />
          <mesh>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="orange" />
          </mesh>
          <OrbitControls enablePan={true} enableZoom={true} enableRotate={true} />
        </Canvas>
      </div>
      <p className="mt-4 text-sm text-neutral-500">
        ✅ R3F is working correctly! You should see an orange cube with mouse controls.
      </p>
    </div>
  );
}
