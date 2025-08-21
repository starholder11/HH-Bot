"use client";
import { useRef, useEffect, useState } from 'react';

function TestScene() {
  const [isClient, setIsClient] = useState(false);
  
  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return (
      <div className="h-96 flex items-center justify-center text-neutral-400 bg-neutral-800 rounded-lg">
        Loading 3D scene...
      </div>
    );
  }

  // Dynamic import R3F components only on client
  const { Canvas, useFrame } = require('@react-three/fiber');
  const { OrbitControls } = require('@react-three/drei');

  function RotatingBox() {
    const meshRef = useRef<any>();
    
    useFrame((state: any, delta: number) => {
      if (meshRef.current) {
        meshRef.current.rotation.x += delta;
        meshRef.current.rotation.y += delta * 0.5;
      }
    });

    return (
      <mesh ref={meshRef}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="orange" />
      </mesh>
    );
  }

  return (
    <Canvas style={{ height: '400px', width: '100%' }} camera={{ position: [3, 3, 3] }}>
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} />
      <RotatingBox />
      <OrbitControls enablePan={true} enableZoom={true} enableRotate={true} />
    </Canvas>
  );
}

export default TestScene;
