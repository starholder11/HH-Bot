"use client";
import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from 'three';
import { applyMediaToMesh, applyTextToMesh, handleTextScroll, isTextMesh, cleanupMediaResources } from '@/lib/spatial/media-utils';

// Proxy helper
function proxy(url: string): string {
  if (!url) return '';
  if (url.startsWith('data:')) return url;
  if (url.startsWith('/api/proxy')) return url;
  return `/api/proxy?url=${encodeURIComponent(url)}`;
}

type ThreeChild = {
  uuid: string;
  type: string;
  name?: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  userData?: any;
  geometry?: { type?: string; width?: number; height?: number };
};

// Individual mesh component that handles media loading
function SpaceMesh({ child }: { child: ThreeChild }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const { position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1], userData } = child;

  console.log(`Rendering mesh ${child.name} at position: [${position[0]}, ${position[1]}, ${position[2]}] scale: [${scale[0]}, ${scale[1]}, ${scale[2]}]`);

    useEffect(() => {
    if (!meshRef.current) return;
    
    const mesh = meshRef.current;
    mesh.name = child.name || `mesh_${child.uuid}`;
    mesh.uuid = child.uuid;
    mesh.userData = { ...userData };
    
    // Position, rotation, scale are now handled declaratively by R3F props
    console.log(`Applied direct positioning to mesh ${child.name}: position [${position[0]}, ${position[1]}, ${position[2]}]`);

    // Apply media using editor functions
    const mediaUrl = userData?.mediaUrl;
    if (mediaUrl) {
      console.log(`Applying media to mesh: ${child.name} mediaUrl: ${mediaUrl} assetType: ${userData?.assetType}`);

      const assetType = String(userData?.assetType || userData?.contentType || "").toLowerCase();
      const isVideo = assetType === 'video' || mediaUrl.includes('.mp4') || mediaUrl.includes('.webm');

      if (isVideo) {
        applyMediaToMesh(mesh, proxy(mediaUrl), assetType, null);
      } else if (assetType === 'text' && !mediaUrl.startsWith('data:image')) {
        // Pure text - use text rendering
        applyTextToMesh(mesh, userData?.fullTextContent || 'Loading...', null);
      } else {
        // Image or pre-rendered text canvas
        applyMediaToMesh(mesh, mediaUrl.startsWith('data:') ? mediaUrl : proxy(mediaUrl), assetType, null);
      }
    }
  }, [child, userData]);

  return (
    <mesh
      ref={meshRef}
      position={position}
      rotation={rotation}
      scale={scale}
    >
      <planeGeometry
        args={[
          Math.max(0.001, child.geometry?.width || 2),
          Math.max(0.001, child.geometry?.height || 2)
        ]}
      />
      <meshBasicMaterial
        side={THREE.DoubleSide}
        toneMapped={false}
        color="#444"
      />
    </mesh>
  );
}

export default function ThreeSceneR3F({ children }: { children: ThreeChild[] }) {
  const { gl } = useThree();
  const groupRef = useRef<THREE.Group>(null);

  // Handle text scrolling
  useEffect(() => {
    if (!gl?.domElement) return;

    const handleWheel = (event: WheelEvent) => {
      // Check if we're hovering over a text mesh
      const raycaster = new THREE.Raycaster();
      const mouse = new THREE.Vector2();
      const rect = gl.domElement.getBoundingClientRect();

      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      // Get camera from Three.js context
      const camera = gl.getContext().scene?.userData?.camera ||
                    (gl as any).camera ||
                    new THREE.PerspectiveCamera();

      raycaster.setFromCamera(mouse, camera);

      if (groupRef.current) {
        const intersects = raycaster.intersectObjects(groupRef.current.children, true);
        if (intersects.length > 0) {
          const mesh = intersects[0].object as THREE.Mesh;
          if (isTextMesh(mesh)) {
            event.preventDefault();
            event.stopPropagation();
            handleTextScroll(mesh, event.deltaY);
          }
        }
      }
    };

    gl.domElement.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      gl.domElement.removeEventListener('wheel', handleWheel);
    };
  }, [gl]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupMediaResources();
    };
  }, []);

  return (
    <group ref={groupRef}>
      {children.map((child) => (
        <SpaceMesh key={child.uuid} child={child} />
      ))}
    </group>
  );
}
