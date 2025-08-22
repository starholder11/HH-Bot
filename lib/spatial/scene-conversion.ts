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
      children: items.map((item: any) => ({
        uuid: item.id,
        type: "Mesh",
        name: item.assetId || item.title || item.id,
        position: item.position || [0, 0, 0],
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
      }))
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
    
    // Handle layout references - they don't have assetId but have layoutId and layoutItemId
    if (child.userData.assetType === 'layout_reference') {
      return {
        id: child.userData.spaceItemId || child.uuid,
        assetId: child.userData.layoutItemId || child.uuid, // Use layoutItemId as assetId for validation
        assetType: 'layout', // Map layout_reference to valid layout type
        position: child.position ? [child.position.x, child.position.y, child.position.z] : [0, 0, 0],
        rotation: child.rotation ? [child.rotation.x, child.rotation.y, child.rotation.z] : [0, 0, 0],
        scale: child.scale ? [child.scale.x, child.scale.y, child.scale.z] : [1, 1, 1],
        opacity: 1,
        visible: child.visible !== false,
        layoutId: child.userData.layoutId,
        layoutItemId: child.userData.layoutItemId,
        mediaUrl: child.userData.mediaUrl,
        importMetadata: child.userData.importMetadata
      };
    }
    
    // Handle regular assets
    return {
      id: child.userData.spaceItemId || child.uuid,
      assetId: child.userData.assetId || child.uuid, // Fallback to uuid if no assetId
      assetType: child.userData.assetType || 'object', // Default to object instead of unknown
      position: child.position ? [child.position.x, child.position.y, child.position.z] : [0, 0, 0],
      rotation: child.rotation ? [child.rotation.x, child.rotation.y, child.rotation.z] : [0, 0, 0],
      scale: child.scale ? [child.scale.x, child.scale.y, child.scale.z] : [1, 1, 1],
      opacity: 1, // TODO: Extract from material
      visible: child.visible !== false,
      mediaUrl: child.userData.mediaUrl,
      importMetadata: child.userData.importMetadata
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