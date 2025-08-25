"use client";
import { useEffect, useRef, useState } from "react";
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
  geometry?: {
    type?: string;
    // Plane/Box
    width?: number; height?: number; depth?: number;
    widthSegments?: number; heightSegments?: number;
    // Sphere
    radius?: number;
    // Cylinder
    radiusTop?: number; radiusBottom?: number; radialSegments?: number;
    // Torus
    tube?: number; tubularSegments?: number;
    // Polyhedra
    detail?: number;
  };
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
    // Ensure raycasting uses default Mesh.raycast
    if (!(mesh as any).raycast) {
      (mesh as any).raycast = (THREE.Mesh as any).prototype.raycast;
    }

    // Log asset ID for debugging
    console.log(`Mesh ${child.name} userData:`, userData);
    console.log(`Mesh ${child.name} assetId:`, userData?.assetId);

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
        // Ensure userData is preserved after media application
        console.log(`[Video] After applyMediaToMesh, userData:`, mesh.userData);
        console.log(`[Video] After applyMediaToMesh, geometry:`, mesh.geometry);
        console.log(`[Video] After applyMediaToMesh, material:`, mesh.material);
        console.log(`[Video] After applyMediaToMesh, visible:`, mesh.visible);
        if (!mesh.userData.assetId && userData?.assetId) {
          console.log(`[Video] Restoring assetId to userData:`, userData.assetId);
          mesh.userData = { ...mesh.userData, ...userData };
        }
      } else if (assetType === 'text') {
        // Text asset - fetch content and use dynamic text rendering with scrolling
        const fetchTextContent = async () => {
          try {
            if (userData?.assetId) {
              const idStr = String(userData.assetId);
              if (idStr.startsWith('text_timeline/')) {
                const afterPrefix = idStr.split('text_timeline/')[1] || '';
                const slug = afterPrefix.split('#')[0];
                if (slug) {
                  const res = await fetch(`/api/internal/get-content/${encodeURIComponent(slug)}`);
                  if (res.ok) {
                    const json = await res.json();
                    const textContent = (json?.content as string) || '';
                    userData.fullTextContent = textContent;
                    applyTextToMesh(mesh, textContent, null);
                  } else {
                    applyTextToMesh(mesh, 'Failed to load text content', null);
                  }
                } else {
                  applyTextToMesh(mesh, 'Invalid text asset id', null);
                }
              } else {
                const response = await fetch(`/api/media-assets/${encodeURIComponent(idStr)}`);
                if (response.ok) {
                  const data = await response.json();
                  const asset = data.asset;
                  let textContent = '';
                  if (asset.lyrics) textContent = asset.lyrics;
                  else if (asset.prompt) textContent = asset.prompt;
                  else if (asset.description) textContent = asset.description;
                  else if (asset.title) textContent = asset.title;
                  else textContent = 'No text content available';
                  userData.fullTextContent = textContent;
                  applyTextToMesh(mesh, textContent, null);
                } else {
                  applyTextToMesh(mesh, 'Failed to load text content', null);
                }
              }
            } else {
              applyTextToMesh(mesh, 'No asset ID available', null);
            }
          } catch (error) {
            console.error('Error fetching text content:', error);
            applyTextToMesh(mesh, 'Error loading text content', null);
          }
        };

        // Start with loading message, then fetch actual content
        applyTextToMesh(mesh, userData?.fullTextContent || 'Loading...', null);
        fetchTextContent();
      } else {
        // Image or other media types
        applyMediaToMesh(mesh, mediaUrl.startsWith('data:') ? mediaUrl : proxy(mediaUrl), assetType, null);
        // Ensure userData is preserved after media application
        console.log(`[${assetType}] After applyMediaToMesh, userData:`, mesh.userData);
        console.log(`[${assetType}] After applyMediaToMesh, geometry:`, mesh.geometry);
        console.log(`[${assetType}] After applyMediaToMesh, material:`, mesh.material);
        console.log(`[${assetType}] After applyMediaToMesh, visible:`, mesh.visible);
        if (!mesh.userData.assetId && userData?.assetId) {
          console.log(`[${assetType}] Restoring assetId to userData:`, userData.assetId);
          mesh.userData = { ...mesh.userData, ...userData };
        }
      }
    }
  }, [child, userData]);

  // Render geometry based on scene child geometry (fallback to Plane)
  const renderGeometry = () => {
    const g = child.geometry || {};
    const t = (g.type || 'PlaneGeometry').toString();
    console.log(`[Geometry] Rendering ${child.name} with geometry:`, t, g);
    switch (t) {
      case 'SphereGeometry': {
        const radius = g.radius ?? 1;
        const widthSegments = g.widthSegments ?? 32;
        const heightSegments = g.heightSegments ?? 16;
        return <sphereGeometry args={[radius, widthSegments, heightSegments]} />;
      }
      case 'BoxGeometry': {
        const width = g.width ?? 1;
        const height = g.height ?? 1;
        const depth = g.depth ?? 1;
        return <boxGeometry args={[width, height, depth]} />;
      }
      case 'CylinderGeometry': {
        const radiusTop = g.radiusTop ?? 1;
        const radiusBottom = g.radiusBottom ?? 1;
        const height = g.height ?? 1;
        const radialSegments = g.radialSegments ?? 32;
        return <cylinderGeometry args={[radiusTop, radiusBottom, height, radialSegments]} />;
      }
      case 'TorusGeometry': {
        const radius = g.radius ?? 1;
        const tube = g.tube ?? 0.4;
        const radialSegments = g.radialSegments ?? 16;
        const tubularSegments = g.tubularSegments ?? 100;
        return <torusGeometry args={[radius, tube, radialSegments, tubularSegments]} />;
      }
      case 'TetrahedronGeometry': {
        const radius = g.radius ?? 1;
        const detail = g.detail ?? 0;
        return <tetrahedronGeometry args={[radius, detail]} />;
      }
      case 'OctahedronGeometry': {
        const radius = g.radius ?? 1;
        const detail = g.detail ?? 0;
        return <octahedronGeometry args={[radius, detail]} />;
      }
      case 'IcosahedronGeometry': {
        const radius = g.radius ?? 1;
        const detail = g.detail ?? 0;
        return <icosahedronGeometry args={[radius, detail]} />;
      }
      case 'DodecahedronGeometry': {
        const radius = g.radius ?? 1;
        const detail = g.detail ?? 0;
        return <dodecahedronGeometry args={[radius, detail]} />;
      }
      case 'PlaneGeometry':
      default: {
        const width = g.width ?? 1;
        const height = g.height ?? 1;
        return <planeGeometry args={[width, height]} />;
      }
    }
  };

  return (
    <mesh
      ref={meshRef}
      position={position}
      rotation={rotation}
      scale={scale}
    >
      {renderGeometry()}
      <meshBasicMaterial
        side={THREE.DoubleSide}
        toneMapped={false}
        color="#ffffff"
        transparent={true}
      />
    </mesh>
  );
}

export default function ThreeSceneR3F({ children, onObjectSelect }: { children: ThreeChild[]; onObjectSelect?: (assetId: string, assetType: string) => void }) {
  const { gl, camera, scene } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  // Track hovered object without re-rendering the component to avoid re-attaching listeners
  const hoveredRef = useRef<THREE.Object3D | null>(null);

  // Helper function to get intersected objects
  const getIntersectedObject = (event: MouseEvent) => {
    if (!gl?.domElement || !groupRef.current) {
      console.log('[Raycast] Missing domElement or groupRef');
      return null;
    }

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const rect = gl.domElement.getBoundingClientRect();

    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    console.log('[Raycast] Mouse coords:', mouse.x, mouse.y);
    console.log('[Raycast] Group children count:', groupRef.current.children.length);

    // Use R3F camera from context
    if (!camera) {
      console.log('[Raycast] Camera is undefined, skipping raycast.');
      return null;
    }
    console.log('[Raycast] Camera type:', camera.type);
    console.log('[Raycast] Camera position:', camera.position);

    // Ensure transforms are up-to-date before raycasting
    scene.updateMatrixWorld(true);
    groupRef.current.updateMatrixWorld(true);

    raycaster.setFromCamera(mouse, camera);
    let intersects = raycaster.intersectObjects(groupRef.current.children, true);
    if (intersects.length === 0) {
      // Fallback to scene-level intersection if group misses
      intersects = raycaster.intersectObjects(scene.children, true);
    }

    console.log('[Raycast] Intersects found:', intersects.length);
    if (intersects.length > 0) {
      console.log('[Raycast] First intersect:', intersects[0].object.name, intersects[0].object.userData);
    } else {
      // Debug: log info about ALL meshes
      console.log('[Raycast] No intersections found. Debugging all meshes:');
      groupRef.current.children.forEach((child, i) => {
        if (child instanceof THREE.Mesh) {
          console.log(`[Raycast] Mesh ${i}:`, {
            name: child.name,
            uuid: child.uuid,
            visible: child.visible,
            position: child.position.toArray(),
            scale: child.scale.toArray(),
            hasGeometry: !!child.geometry,
            geometryType: child.geometry?.type,
            hasMaterial: !!child.material,
            materialType: child.material?.type,
            hasUserData: !!child.userData,
            assetId: child.userData?.assetId
          });
        }
      });
    }

    return intersects.length > 0 ? intersects[0].object : null;
  };

  // Handle mouse interactions (hover, click)
  useEffect(() => {
    if (!gl?.domElement) {
      console.log('[EventListeners] No domElement available');
      return;
    }

    console.log('[EventListeners] Setting up event listeners on:', gl.domElement);

    const handleMouseMove = (event: MouseEvent) => {
      // Throttle mouse move events to avoid spam
      if (Date.now() - (handleMouseMove as any).lastCall < 50) return;
      (handleMouseMove as any).lastCall = Date.now();

      console.log('[MouseMove] Event triggered at:', event.clientX, event.clientY);
      const intersectedObject = getIntersectedObject(event);

      if (intersectedObject !== hoveredRef.current) {
        console.log('[MouseMove] Object changed, old:', hoveredRef.current?.name, 'new:', intersectedObject?.name);

        // Reset previous hover
        if (hoveredRef.current) {
          gl.domElement.style.cursor = 'default';
          console.log('[MouseMove] Reset cursor to default');
        }

        // Set new hover
        if (intersectedObject) {
          const mesh = intersectedObject as THREE.Mesh;
          const userData = mesh.userData;

          console.log('[MouseMove] Intersected object userData:', userData);

          // Only show hover cursor if object has an assetId (clickable)
          if (userData?.assetId) {
            gl.domElement.style.cursor = 'pointer';
            console.log(`[MouseMove] Hovering over object with assetId: ${userData.assetId}`);
          } else {
            console.log('[MouseMove] No assetId found in userData');
          }
        }
        hoveredRef.current = intersectedObject;
      }
    };

    const handleDoubleClick = (event: MouseEvent) => {
      console.log('[DoubleClick] Event triggered at:', event.clientX, event.clientY);
      console.log('[DoubleClick] onObjectSelect callback available:', !!onObjectSelect);

      const intersectedObject = getIntersectedObject(event);

      if (intersectedObject) {
        const mesh = intersectedObject as THREE.Mesh;
        const userData = mesh.userData;

        console.log('[DoubleClick] Intersected object:', mesh.name);
        console.log('[DoubleClick] Intersected object userData:', userData);

        // Only trigger modal if object has an assetId
        if (userData?.assetId && onObjectSelect) {
          console.log(`[DoubleClick] Calling onObjectSelect with assetId: ${userData.assetId}, assetType: ${userData.assetType}`);
          onObjectSelect(userData.assetId, userData.assetType || 'unknown');
        } else {
          if (!userData?.assetId) {
            console.log('[DoubleClick] No assetId found in userData');
          }
          if (!onObjectSelect) {
            console.log('[DoubleClick] No onObjectSelect callback provided');
          }
        }
      } else {
        console.log('[DoubleClick] No intersected object found');
      }
    };

    const handleWheel = (event: WheelEvent) => {
      // Check if we're hovering over a text mesh for scrolling
      const intersectedObject = getIntersectedObject(event as any);

      if (intersectedObject) {
        const mesh = intersectedObject as THREE.Mesh;
        if (isTextMesh(mesh)) {
          event.preventDefault();
          event.stopPropagation();
          handleTextScroll(mesh, event.deltaY);
        }
      }
    };

    console.log('[EventListeners] Attaching mouse event listeners to:', gl.domElement);

    gl.domElement.addEventListener('mousemove', handleMouseMove);
    gl.domElement.addEventListener('dblclick', handleDoubleClick);
    gl.domElement.addEventListener('wheel', handleWheel, { passive: false });

    console.log('[EventListeners] Event listeners attached successfully');

    return () => {
      console.log('[EventListeners] Removing event listeners');
      gl.domElement.removeEventListener('mousemove', handleMouseMove);
      gl.domElement.removeEventListener('dblclick', handleDoubleClick);
      gl.domElement.removeEventListener('wheel', handleWheel);
      // Reset cursor on cleanup
      gl.domElement.style.cursor = 'default';
    };
  }, [gl, onObjectSelect, scene, camera]);

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
