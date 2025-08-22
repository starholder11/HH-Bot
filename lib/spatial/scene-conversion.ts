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
  const items = space.space?.items || space.items || [];
  
  console.log('[Scene Conversion] Converting space with items:', items);
  
  return {
    metadata: {
      version: 4.5,
      type: "Object",
      generator: "HH-Bot Spatial CMS"
    },
    geometries: (space.space?.items || space.items || []).map((item: any) => generateGeometryForItem(item)),
    materials: generateMaterialsFromSpace(space),
    textures: generateTexturesFromSpace(space),
    images: generateImagesFromSpace(space),
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
          uuid: item.id,
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
            importMetadata: item.importMetadata
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
  console.log('[Scene Conversion] Existing space:', existingSpace);
  
  if (!scene || !scene.object || !scene.object.children) {
    console.error('[Scene Conversion] Invalid scene structure:', scene);
    throw new Error('Invalid scene structure for conversion');
  }

  const items = scene.object.children.map(child => {
    console.log('[Scene Conversion] Processing child:', child);
    
    // Extract position from array format used by Three.js
    const position = child.position || [0, 0.5, 0];
    const x = position[0];
    const y = position[1];
    const z = position[2];
    
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
    
    console.log(`[Scene Conversion] Item ${child.name}: position [${x}, ${y}, ${z}], mediaUrl: ${mediaUrl}`);
    
    // Handle layout references - they don't have assetId but have layoutId and layoutItemId
    if (child.userData?.assetType === 'layout_reference') {
      return {
        id: child.userData.spaceItemId || child.uuid,
        assetId: child.userData.layoutItemId || child.uuid, // Use layoutItemId as assetId for validation
        assetType: 'layout', // Map layout_reference to valid layout type
        position: [x, y, z],
        rotation: child.rotation || [0, 0, 0],
        scale: child.scale || [1, 1, 1],
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
    
    // Handle regular assets
    return {
      id: child.userData?.spaceItemId || child.uuid,
      assetId: child.userData?.assetId || child.uuid, // Fallback to uuid if no assetId
      assetType: child.userData?.assetType || 'object', // Default to object instead of unknown
      position: [x, y, z],
      rotation: child.rotation || [0, 0, 0],
      scale: child.scale || [1, 1, 1],
      // Store both layout coordinates and 3D position for compatibility
      x: x,
      y: z, // z maps to layout y
      opacity: 1, // TODO: Extract from material
      visible: child.visible !== false,
      mediaUrl,
      importMetadata: child.userData?.importMetadata
    };
  });

  console.log('[Scene Conversion] Converted items:', items);

  // Ensure we have a base space object to spread
  const baseSpace = (existingSpace as any).space || {};

  const result = {
    ...existingSpace,
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
  switch (item.assetType) {
    case 'image':
    case 'video':
    case 'layout':
      return {
        uuid: `geom-${item.id}`,
        type: 'PlaneGeometry',
        width: 2,
        height: 2
      };
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