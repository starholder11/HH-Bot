"use client";
import dynamic from 'next/dynamic';

// Dynamic import to avoid SSR issues with Three.js
const Canvas = dynamic(() => import('@react-three/fiber').then(mod => ({ default: mod.Canvas })), { ssr: false });
const Box = dynamic(() => import('@react-three/drei').then(mod => ({ default: mod.Box })), { ssr: false });

function TestScene() {
  return (
    <Canvas style={{ height: '400px', width: '100%' }}>
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} />
      <Box args={[1, 1, 1]} position={[0, 0, 0]}>
        <meshStandardMaterial color="orange" />
      </Box>
    </Canvas>
  );
}

export default TestScene;
