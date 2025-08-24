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

export default function ThreeSceneR3F({ children }: { children: ThreeChild[] }) {
  const { gl } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const meshRefs = useRef<Map<string, THREE.Mesh>>(new Map());

  // Create meshes and apply media using editor functions
  useEffect(() => {
    if (!groupRef.current || !children?.length) return;

    // Clear existing meshes
    meshRefs.current.forEach((mesh) => {
      if (mesh.parent) mesh.parent.remove(mesh);
    });
    meshRefs.current.clear();

    // Create new meshes for each child
    children.forEach((child) => {
      const { position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1], userData } = child;
      const assetType = String(userData?.assetType || userData?.contentType || "").toLowerCase();

      // Create mesh with plane geometry (matching editor's approach)
      const geometry = new THREE.PlaneGeometry(
        child.geometry?.width || 2,
        child.geometry?.height || 2
      );
      const material = new THREE.MeshBasicMaterial({
        side: THREE.DoubleSide,
        toneMapped: false,
        color: '#444' // Default color until media loads
      });
      const mesh = new THREE.Mesh(geometry, material);

      // Set transform
      mesh.position.set(...position);
      mesh.rotation.set(...rotation);
      mesh.scale.set(...scale);
      mesh.name = child.name || `mesh_${child.uuid}`;
      mesh.uuid = child.uuid;
      mesh.userData = { ...userData };

      // Add to scene
      groupRef.current!.add(mesh);
      meshRefs.current.set(child.uuid, mesh);

      // Apply media using editor functions
      const mediaUrl = userData?.mediaUrl;
      if (mediaUrl) {
        console.log('Applying media to mesh:', mesh.name, 'mediaUrl:', mediaUrl, 'assetType:', assetType);
        applyMediaToMesh(mesh, proxy(mediaUrl), assetType);
      } else if (assetType === 'text' || userData?.contentType === 'text') {
        // For text without mediaUrl, we need to fetch content or use fallback
        const handleTextContent = async () => {
          let textContent = userData?.fullTextContent || userData?.text || mesh.name;

          // Try to fetch full content if we have an assetId
          if (userData?.assetId && typeof userData.assetId === 'string') {
            const match = userData.assetId.match(/text_timeline\/([^#]+)/);
            if (match) {
              const slug = match[1];
              try {
                const res = await fetch(`/api/internal/get-content/${encodeURIComponent(slug)}`);
                if (res.ok) {
                  const json = await res.json();
                  if (json?.success && json?.content) {
                    textContent = json.content;
                  }
                }
              } catch (e) {
                console.warn('Failed to fetch text content for', slug, e);
              }
            }
          }

          console.log('Applying text to mesh:', mesh.name, 'Content length:', String(textContent).length);
          applyTextToMesh(mesh, String(textContent));
        };

        handleTextContent();
      }
    });

    // Cleanup function
    return () => {
      meshRefs.current.forEach((mesh) => {
        if (mesh.parent) mesh.parent.remove(mesh);
        mesh.geometry?.dispose();
        if (mesh.material instanceof THREE.Material) {
          mesh.material.dispose();
        }
      });
      meshRefs.current.clear();
    };
  }, [children]);

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

  return <group ref={groupRef} />;
}
