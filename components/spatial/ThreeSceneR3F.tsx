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
      } else if (assetType === 'text' && !mediaUrl.startsWith('data:image')) {
        // Pure text - fetch content and use text rendering
        const fetchTextContent = async () => {
          try {
            if (userData?.assetId) {
              const response = await fetch(`/api/media-assets/${userData.assetId}`);
              if (response.ok) {
                const data = await response.json();
                const asset = data.asset;
                // Extract text content from various possible fields
                let textContent = '';
                if (asset.lyrics) {
                  textContent = asset.lyrics;
                } else if (asset.prompt) {
                  textContent = asset.prompt;
                } else if (asset.description) {
                  textContent = asset.description;
                } else if (asset.title) {
                  textContent = asset.title;
                } else {
                  textContent = 'No text content available';
                }
                
                // Update userData with the fetched content
                userData.fullTextContent = textContent;
                applyTextToMesh(mesh, textContent, null);
              } else {
                applyTextToMesh(mesh, 'Failed to load text content', null);
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
          1,
          1
        ]}
      />
      <meshBasicMaterial
        side={THREE.DoubleSide}
        toneMapped={false}
        color="#ffffff"
      />
    </mesh>
  );
}

export default function ThreeSceneR3F({ children, onObjectSelect }: { children: ThreeChild[]; onObjectSelect?: (assetId: string, assetType: string) => void }) {
  const { gl } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const [hoveredObject, setHoveredObject] = useState<THREE.Object3D | null>(null);

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

    // Get camera from R3F context - use gl.camera directly
    const camera = gl.camera;
    if (!camera) {
      console.log('[Raycast] Camera is undefined, skipping raycast.');
      return null;
    }
    console.log('[Raycast] Camera type:', camera.type);
    console.log('[Raycast] Camera position:', camera.position);

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(groupRef.current.children, true);
    
    console.log('[Raycast] Intersects found:', intersects.length);
    if (intersects.length > 0) {
      console.log('[Raycast] First intersect:', intersects[0].object.name, intersects[0].object.userData);
    } else {
      // Debug: log info about the first few meshes
      groupRef.current.children.slice(0, 2).forEach((child, i) => {
        if (child instanceof THREE.Mesh) {
          console.log(`[Raycast] Mesh ${i}:`, {
            name: child.name,
            visible: child.visible,
            position: child.position,
            scale: child.scale,
            hasGeometry: !!child.geometry,
            geometryType: child.geometry?.type,
            hasMaterial: !!child.material
          });
        }
      });
    }
    
    return intersects.length > 0 ? intersects[0].object : null;
  };

  // Handle mouse interactions (hover, click)
  useEffect(() => {
    if (!gl?.domElement) return;

    const handleMouseMove = (event: MouseEvent) => {
      console.log('[MouseMove] Event triggered');
      const intersectedObject = getIntersectedObject(event);
      
      if (intersectedObject !== hoveredObject) {
        console.log('[MouseMove] Object changed, old:', hoveredObject?.name, 'new:', intersectedObject?.name);
        
        // Reset previous hover
        if (hoveredObject) {
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
        
        setHoveredObject(intersectedObject);
      }
    };

    const handleDoubleClick = (event: MouseEvent) => {
      console.log('[DoubleClick] Event triggered');
      const intersectedObject = getIntersectedObject(event);
      
      if (intersectedObject) {
        const mesh = intersectedObject as THREE.Mesh;
        const userData = mesh.userData;
        
        console.log('[DoubleClick] Intersected object userData:', userData);
        
        // Only trigger modal if object has an assetId
        if (userData?.assetId && onObjectSelect) {
          console.log(`[DoubleClick] Double-clicked object with assetId: ${userData.assetId}, assetType: ${userData.assetType}`);
          onObjectSelect(userData.assetId, userData.assetType || 'unknown');
        } else {
          console.log('[DoubleClick] No assetId or onObjectSelect callback');
        }
      } else {
        console.log('[DoubleClick] No intersected object');
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
  }, [gl, hoveredObject, onObjectSelect]);

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
