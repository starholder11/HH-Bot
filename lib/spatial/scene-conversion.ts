/**
 * Scene Conversion Functions
 * Converts between SpaceAsset format and Three.js Scene format
 */

// Three.js Scene format interfaces
export interface ThreeJSScene {
  metadata: {
    version: number;
    type: string;
    generator: string;
  };
  geometries: any[];
  materials: any[];
  textures: any[];
  images: any[];
  object: {
    uuid: string;
    type: string;
    name: string;
    children: ThreeJSObject[];
  };
  userData: {
    spaceId: string;
    spaceType: string;
    environment: any;
    camera: any;
  };
}

export interface ThreeJSObject {
  uuid: string;
  type: string;
  name: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  geometry?: string;
  material?: string;
  visible?: boolean;
  userData: {
    spaceItemId: string;
    assetId: string;
    assetType: string;
    importMetadata?: any;
  };
}

// Placeholder for SpaceAsset type - will be properly defined in Task 1.1
interface SpaceAsset {
  id: string;
  title: string;
  space_type: string;
  space: {
    items: SpaceItem[];
    environment: any;
    camera: any;
  };
  updated_at: string;
}

interface SpaceItem {
  id: string;
  assetId: string;
  assetType: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  opacity?: number;
  visible?: boolean;
  importMetadata?: any;
  // Layout coordinates for compatibility
  x?: number;
  y?: number;
  mediaUrl?: string;
}

/**
 * Convert SpaceAsset to Three.js Scene format
 */
export function convertSpaceToThreeJSScene(space: SpaceAsset): ThreeJSScene {
  // Handle different possible data structures
  const itemsAll = space.space?.items || space.items || [];
  
  console.log('[Scene Conversion] Converting space with items:', itemsAll);
  
  // Filter out items that create unwanted empty planes
  const items = itemsAll.filter((item: any) => {
    const t = (item?.assetType || '').toString().toLowerCase();
    const hasMedia = Boolean((item as any).mediaUrl);
    const hasAssetId = Boolean(item?.assetId);
    
    console.log(`[Scene Conversion] Filtering item ${item.id}: assetType=${t}, hasMedia=${hasMedia}, hasAssetId=${hasAssetId}, assetId=${item?.assetId}`);
    
    // Keep items with media content
    if (hasMedia) return true;
    
    // Keep text/layout items (these are placeholders we want)
    if (['text', 'layout'].includes(t)) return true;
    
    // Keep object_collection types with media
    if (t === 'object_collection' && hasMedia) return true;
    
    // Skip object types without media - these create empty backing planes
    if (t === 'object' && !hasMedia) {
      console.log(`[Scene Conversion] Skipping object without media: ${item.id}`);
      return false;
    }
    
    // Skip items with no assetType, no media, and no assetId
    if (!t && !hasMedia && !hasAssetId) return false;
    
    // Default: keep everything else
    return true;
  });
  
  return {
    metadata: {
      version: 4.5,
      type: "Object",
      generator: "HH-Bot Spatial CMS"
    },
    geometries: items.map((item: any) => generateGeometryForItem(item)),
    materials: generateMaterialsFromSpace({ ...space, space: { ...(space.space||{}), items } } as any),
    textures: generateTexturesFromSpace({ ...space, space: { ...(space.space||{}), items } } as any),
    images: generateImagesFromSpace({ ...space, space: { ...(space.space||{}), items } } as any),
    object: {
      uuid: space.id,
      type: "Scene",
      name: space.title,
      children: items.map((item: any) => {
        // Use stored position or calculate from layout coordinates
        const x = item.position?.[0] ?? (item.x || 0);
        const y = item.position?.[1] ?? 0.5; // Keep objects slightly above ground
        const z = item.position?.[2] ?? (item.y || 0);
        
        console.log(`[Scene Conversion] Item ${item.id}: position [${x}, ${y}, ${z}], mediaUrl: ${item.mediaUrl}`);
        
        return {
          uuid: item.id, // Use item.id as UUID for consistency
          type: "Mesh",
          name: item.assetId || item.title || item.id,
          position: [x, y, z],
          rotation: item.rotation || [0, 0, 0],
          scale: item.scale || [1, 1, 1],
          geometry: `geom-${item.id}`, // Reference to geometry in geometries array
          material: `mat-${item.id}`, // Reference to material in materials array
          visible: item.visible !== false,
          userData: {
            spaceItemId: item.id,
            assetId: item.assetId,
            assetType: item.assetType,
            mediaUrl: (item as any).mediaUrl,
            importMetadata: item.importMetadata,
            // For text assets, we'll need to fetch the content separately
            fullTextContent: item.assetType === 'text' ? 'Loading...' : undefined
          }
        };
      })
    },
    userData: {
      spaceId: space.id,
      spaceType: space.space_type,
      environment: space.space?.environment,
      camera: space.space?.camera
    }
  };
}

/**
 * Convert Three.js Scene back to SpaceAsset format
 */
export function convertThreeJSSceneToSpace(scene: ThreeJSScene, existingSpace: SpaceAsset): SpaceAsset {
  console.log('[Scene Conversion] Converting Three.js scene to SpaceAsset:', scene);
  console.log('[Scene Conversion] Scene keys:', Object.keys(scene));
  console.log('[Scene Conversion] Scene.object:', scene.object);
  console.log('[Scene Conversion] Existing space:', existingSpace);
  
  // Helpers to robustly extract transforms from various shapes (array/object/matrix)
  const extractPosition = (child: any): [number, number, number] => {
    let px = 0, py = 0.5, pz = 0;
    try {
      if (child.position && Array.isArray(child.position)) {
        px = child.position[0] ?? 0;
        py = child.position[1] ?? 0.5;
        pz = child.position[2] ?? 0;
      } else if (child.position && typeof child.position === 'object') {
        px = child.position.x ?? 0;
        py = child.position.y ?? 0.5;
        pz = child.position.z ?? 0;
      } else if (child.matrix && Array.isArray(child.matrix) && child.matrix.length === 16) {
        // Extract position from transformation matrix (elements 12, 13, 14)
        px = child.matrix[12] ?? 0;
        py = child.matrix[13] ?? 0.5;
        pz = child.matrix[14] ?? 0;
      }
    } catch {}
    return [px, py, pz];
  };
  
  const extractRotation = (child: any): [number, number, number] => {
    try {
      if (Array.isArray(child.rotation)) {
        return [child.rotation[0] ?? 0, child.rotation[1] ?? 0, child.rotation[2] ?? 0];
      }
      if (child.rotation && typeof child.rotation === 'object') {
        return [child.rotation.x ?? 0, child.rotation.y ?? 0, child.rotation.z ?? 0];
      }
      // Derive rotation (Euler XYZ, radians) from transformation matrix if available
      if (child.matrix && Array.isArray(child.matrix) && child.matrix.length === 16) {
        const m = child.matrix as number[];
        // Remove scale by normalizing basis vectors (columns)
        const sx = Math.hypot(m[0], m[1], m[2]) || 1;
        const sy = Math.hypot(m[4], m[5], m[6]) || 1;
        const sz = Math.hypot(m[8], m[9], m[10]) || 1;

        const r00 = m[0] / sx, r01 = m[4] / sy, r02 = m[8] / sz;
        const r10 = m[1] / sx, r11 = m[5] / sy, r12 = m[9] / sz;
        const r20 = m[2] / sx, r21 = m[6] / sy, r22 = m[10] / sz;

        const syHyp = Math.sqrt(r00 * r00 + r10 * r10);
        let x = 0, y = 0, z = 0;
        if (syHyp > 1e-6) {
          x = Math.atan2(r21, r22);
          y = Math.atan2(-r20, syHyp);
          z = Math.atan2(r10, r00);
        } else {
          // Gimbal lock
          x = Math.atan2(-r12, r11);
          y = Math.atan2(-r20, syHyp);
          z = 0;
        }
        return [x, y, z];
      }
    } catch {}
    return [0, 0, 0];
  };
  
  const extractScale = (child: any): [number, number, number] => {
    try {
      if (Array.isArray(child.scale)) {
        return [child.scale[0] ?? 1, child.scale[1] ?? 1, child.scale[2] ?? 1];
      }
      if (child.scale && typeof child.scale === 'object') {
        return [child.scale.x ?? 1, child.scale.y ?? 1, child.scale.z ?? 1];
      }
      if (child.matrix && Array.isArray(child.matrix) && child.matrix.length === 16) {
        // Derive scale from matrix columns lengths
        const m = child.matrix;
        const sx = Math.hypot(m[0], m[1], m[2]) || 1;
        const sy = Math.hypot(m[4], m[5], m[6]) || 1;
        const sz = Math.hypot(m[8], m[9], m[10]) || 1;
        return [sx, sy, sz];
      }
    } catch {}
    return [1, 1, 1];
  };
  
  // Collect Mesh nodes recursively and accumulate parent scale so group scaling is preserved
  type Accumulated = {
    node: any;
    worldScale: [number, number, number];
  };

  const collectMeshes = (node: any): Accumulated[] => {
    if (!node) return [];

    const out: Accumulated[] = [];

    const multiplyScale = (a: [number, number, number], b: [number, number, number]): [number, number, number] => {
      return [
        (a?.[0] ?? 1) * (b?.[0] ?? 1),
        (a?.[1] ?? 1) * (b?.[1] ?? 1),
        (a?.[2] ?? 1) * (b?.[2] ?? 1)
      ];
    };

    const recurse = (n: any, parentScale: [number, number, number]) => {
      try {
        if (!n) return;
        const localScale = extractScale(n);
        const worldScale = multiplyScale(parentScale, localScale);
        if (n.type === 'Mesh') {
          out.push({ node: n, worldScale });
        }
        const kids = (n.children || []);
        for (const k of kids) recurse(k, worldScale);
      } catch {}
    };

    recurse(node, [1, 1, 1]);
    return out;
  };

  let meshChildren: Accumulated[] = [];
  if (scene.object) {
    meshChildren = collectMeshes(scene.object);
  } else if ((scene as any).children) {
    meshChildren = collectMeshes({ children: (scene as any).children });
  }

  console.log('[Scene Conversion] Found mesh children:', meshChildren.length);

  const items = meshChildren.map(entry => {
    const child = entry.node;
    console.log('[Scene Conversion] Processing child:', child);
    console.log('[Scene Conversion] Child UUID:', child.uuid, 'Child name:', child.name);
    console.log('[Scene Conversion] Child userData:', child.userData);
    
    // Skip empty groups/placeholders with no userData
    // Note: we only process Mesh nodes; Groups are handled by recursive collection above
    
    // Extract transforms from Three.js object (supports array/object/matrix)
    const [x, y, z] = extractPosition(child);
    const rot = extractRotation(child);
    const localScale = extractScale(child);
    const scl = entry.worldScale || localScale;
    
    // Extract mediaUrl from material texture or userData
    let mediaUrl = child.userData?.mediaUrl || '';
    if (!mediaUrl && child.material) {
      // Try to find texture and its image URL from scene data
      const material = scene.materials?.find((m: any) => m.uuid === child.material);
      if (material?.map) {
        const texture = scene.textures?.find((t: any) => t.uuid === material.map);
        if (texture) {
          const image = scene.images?.find((i: any) => i.uuid === texture.image);
          if (image) {
            mediaUrl = image.url || '';
          }
        }
      }
    }
    
    // If absolutely no identifying data (no userData.type and no media), skip
    if ((!child.userData || (!child.userData.assetType && !child.userData.sourceType)) && !mediaUrl) {
      return null;
    }
    
    console.log(`[Scene Conversion] Item ${child.name}: position [${x}, ${y}, ${z}], rotation [${rot[0]}, ${rot[1]}, ${rot[2]}], localScale [${localScale[0]}, ${localScale[1]}, ${localScale[2]}], worldScale [${scl[0]}, ${scl[1]}, ${scl[2]}], mediaUrl: ${mediaUrl}`);
    
    // If added from layout import, preserve the declared media type/content type
    const declaredType = (child.userData?.assetType || child.userData?.contentType) as string | undefined;
    const normalizeType = (t?: string): string | undefined => {
      if (!t) return undefined;
      const tt = String(t).toLowerCase();
      switch (tt) {
        case 'image':
        case 'image_ref':
          return 'image';
        case 'video':
        case 'video_ref':
          return 'video';
        case 'audio':
        case 'music':
        case 'audio_ref':
        case 'music_ref':
          return 'audio';
        case 'text':
        case 'text_ref':
        case 'content_ref':
          return 'text';
        case 'canvas':
          return 'canvas';
        case 'layout':
        case 'layout_reference':
          return 'layout';
        case 'object':
        default:
          return 'object';
      }
    };
    const normalizedType = normalizeType(declaredType);
    if (child.userData?.sourceType === 'layout' && normalizedType) {
      // Use the mesh UUID as the item ID to maintain consistency
      const itemId = child.uuid; // Use the actual mesh UUID from Three.js
      return {
        id: itemId,
        assetId: child.userData.layoutItemId || child.uuid,
        assetType: normalizedType,
        position: [x, y, z],
        rotation: rot,
        scale: scl,
        // Store both layout coordinates and 3D position for compatibility
        x: x,
        y: z, // z maps to layout y
        opacity: 1,
        visible: child.visible !== false,
        layoutId: child.userData.layoutId,
        layoutItemId: child.userData.layoutItemId,
        mediaUrl,
        importMetadata: child.userData.importMetadata
      };
    }
    
    // Handle regular assets - use mesh UUID as item ID for consistency
    return {
      id: child.uuid, // Use the actual mesh UUID from Three.js for consistency
      assetId: child.userData?.assetId || child.uuid, // Fallback to uuid if no assetId
      assetType: normalizeType(child.userData?.assetType) || 'object', // Default to object instead of unknown
      position: [x, y, z],
      rotation: rot,
      scale: scl,
      // Store both layout coordinates and 3D position for compatibility
      x: x,
      y: z, // z maps to layout y
      opacity: 1, // TODO: Extract from material
      visible: child.visible !== false,
      mediaUrl,
      importMetadata: child.userData?.importMetadata
    };
  }).filter(Boolean);

  console.log('[Scene Conversion] Converted items:', items);

  // Ensure we have a base space object to spread
  const baseSpace = (existingSpace as any).space || {};

  // Persist title: prefer existing space title; only use editor name if it's meaningful (not default 'Scene')
  const editorSceneName = (scene as any)?.object?.name;
  const sceneTitle = (editorSceneName && editorSceneName !== 'Scene') ? editorSceneName : existingSpace.title;

  const result = {
    ...existingSpace,
    title: sceneTitle,
    space: {
      ...baseSpace,
      items,
      environment: (scene as any).userData?.environment ?? baseSpace.environment ?? {},
      camera: (scene as any).userData?.camera ?? baseSpace.camera ?? {}
    },
    updated_at: new Date().toISOString()
  } as SpaceAsset;

  console.log('[Scene Conversion] Final result:', result);
  return result;
}

// Helper functions for material/texture generation
function generateMaterialsFromSpace(space: SpaceAsset): any[] {
  const items = space.space?.items || space.items || [];
  return items.map((item: any) => generateMaterialForItem(item));
}

function generateTexturesFromSpace(space: SpaceAsset): any[] {
  const items = space.space?.items || space.items || [];
  return items
    .filter((item: any) => !!(item as any).mediaUrl)
    .map((item: any) => ({
      uuid: `tex-${item.id}`,
      image: `img-${item.id}`,
      type: 'Texture',
      flipY: false,
      colorSpace: 'srgb'
    }));
}

function generateImagesFromSpace(space: SpaceAsset): any[] {
  const items = space.space?.items || space.items || [];
  return items
    .filter((item: any) => !!(item as any).mediaUrl)
    .map((item: any) => ({
      uuid: `img-${item.id}`,
      url: (item as any).mediaUrl
    }));
}

function generateGeometryForItem(item: SpaceItem): any {
  // Generate actual Three.js geometry objects
  // Match the logic from SpaceEditor.tsx import: only image and video are flat planes
  switch (item.assetType) {
    case 'image':
    case 'video':
      return {
        uuid: `geom-${item.id}`,
        type: 'PlaneGeometry',
        width: 2,
        height: 2
      };
    case 'layout':
    case 'object':
      return {
        uuid: `geom-${item.id}`,
        type: 'BoxGeometry',
        width: 1,
        height: 1,
        depth: 1
      };
    case 'object_collection':
      return {
        uuid: `geom-${item.id}`,
        type: 'BoxGeometry',
        width: 2,
        height: 2,
        depth: 2
      };
    default:
      return {
        uuid: `geom-${item.id}`,
        type: 'BoxGeometry',
        width: 1,
        height: 1,
        depth: 1
      };
  }
}

function generateMaterialForItem(item: SpaceItem): any {
  // Generate actual Three.js material objects
  const baseColor = item.assetType === 'image' ? 0x3b82f6 :
                   item.assetType === 'video' ? 0xef4444 :
                   item.assetType === 'layout' ? 0x8b5cf6 : 0x666666;

  const material: any = {
    uuid: `mat-${item.id}`,
    type: 'MeshBasicMaterial',
    color: baseColor,
    side: 2, // DoubleSide
    transparent: true,
    opacity: item.opacity || 1
  };

  const mediaUrl = (item as any).mediaUrl;
  if (mediaUrl) {
    material.map = `tex-${item.id}`;
  }

  return material;
}
