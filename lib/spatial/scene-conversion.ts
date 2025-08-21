/**
 * Space-to-Three.js Scene Conversion
 * 
 * Implements bidirectional conversion between SpaceAsset format
 * and Three.js scene format for editor integration
 */

import type { SpaceAsset } from '../media-storage';

export interface ThreeJSScene {
  metadata: {
    version: string;
    type: string;
    generator: string;
  };
  geometries: any[];
  materials: any[];
  textures: any[];
  images: any[];
  shapes: any[];
  skeletons: any[];
  animations: any[];
  nodes: any[];
  object: {
    uuid: string;
    type: string;
    name: string;
    layers: number;
    matrix: number[];
    children: any[];
  };
}

export interface ConversionOptions {
  includeMetadata?: boolean;
  preserveUserData?: boolean;
  generateIds?: boolean;
  coordinateSystem?: 'threejs' | 'space'; // Y-up vs coordinate conventions
}

const DEFAULT_OPTIONS: ConversionOptions = {
  includeMetadata: true,
  preserveUserData: true,
  generateIds: true,
  coordinateSystem: 'threejs',
};

/**
 * Convert SpaceAsset to Three.js scene format
 */
export function convertSpaceToThreeJSScene(
  spaceAsset: SpaceAsset,
  options: Partial<ConversionOptions> = {}
): ThreeJSScene {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  const scene: ThreeJSScene = {
    metadata: {
      version: "4.3",
      type: "Object",
      generator: "HH-Bot Spatial System v1.0"
    },
    geometries: [],
    materials: [],
    textures: [],
    images: [],
    shapes: [],
    skeletons: [],
    animations: [],
    nodes: [],
    object: {
      uuid: spaceAsset.id,
      type: "Scene",
      name: spaceAsset.filename || "Space Scene",
      layers: 1,
      matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      children: []
    }
  };

  // Convert space items to Three.js objects
  if (spaceAsset.space.items) {
    for (const item of spaceAsset.space.items) {
      const threeObject = convertSpaceItemToThreeJSObject(item, opts);
      if (threeObject) {
        scene.object.children.push(threeObject);
        
        // Add required geometries and materials
        if (threeObject.geometry && !scene.geometries.find(g => g.uuid === threeObject.geometry)) {
          scene.geometries.push(generateGeometryForAssetType(item.assetType, threeObject.geometry));
        }
        
        if (threeObject.material && !scene.materials.find(m => m.uuid === threeObject.material)) {
          scene.materials.push(generateMaterialForAssetType(item.assetType, threeObject.material));
        }
      }
    }
  }

  // Add environment settings as scene userData
  if (opts.includeMetadata) {
    (scene.object as any).userData = {
      spaceMetadata: {
        spaceType: spaceAsset.space_type,
        environment: spaceAsset.space.environment,
        camera: spaceAsset.space.camera,
        relationships: spaceAsset.space.relationships,
        zones: spaceAsset.space.zones,
      },
      conversionMetadata: {
        convertedAt: new Date().toISOString(),
        sourceVersion: spaceAsset.version,
        coordinateSystem: opts.coordinateSystem,
      }
    };
  }

  return scene;
}

/**
 * Convert Three.js scene back to SpaceAsset format
 */
export function convertThreeJSSceneToSpace(
  scene: ThreeJSScene,
  originalSpaceId?: string,
  options: Partial<ConversionOptions> = {}
): SpaceAsset {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  // Extract space metadata from userData if available
  const userData = (scene.object as any).userData || {};
  const spaceMetadata = userData.spaceMetadata || {};
  
  const spaceAsset: SpaceAsset = {
    id: originalSpaceId || scene.object.uuid,
    filename: `${scene.object.name || 'converted-space'}.json`,
    media_type: 'space',
    space_type: spaceMetadata.spaceType || 'custom',
    metadata: {
      item_count: scene.object.children.length,
    },
    space: {
      environment: spaceMetadata.environment || {
        backgroundColor: '#111217',
        lighting: 'studio',
      },
      camera: spaceMetadata.camera || {
        position: [4, 3, 6],
        target: [0, 0, 0],
        fov: 50,
        controls: 'orbit',
      },
      items: scene.object.children.map(child => 
        convertThreeJSObjectToSpaceItem(child, scene, opts)
      ).filter(Boolean),
      relationships: spaceMetadata.relationships || [],
      zones: spaceMetadata.zones || [],
    },
    s3_url: `spaces/${originalSpaceId || scene.object.uuid}.json`,
    cloudflare_url: '',
    processing_status: {
      created: 'completed',
      spatial_preview: 'completed',
      thumbnail: 'pending',
    },
    timestamps: {
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    title: scene.object.name || 'Converted Space',
    description: 'Space converted from Three.js Editor',
    ai_labels: { scenes: [], objects: [], style: [], mood: [], themes: [], confidence_scores: {} },
    manual_labels: { scenes: [], objects: [], style: [], mood: [], themes: [], custom_tags: [] },
    processing_status: {
      upload: 'completed',
      metadata_extraction: 'completed',
      ai_labeling: 'not_started',
      manual_review: 'pending',
    },
    timestamps: {
      uploaded: new Date().toISOString(),
      metadata_extracted: new Date().toISOString(),
      labeled_ai: null,
      labeled_reviewed: null,
    },
    labeling_complete: false,
    project_id: null,
  };

  return spaceAsset;
}

/**
 * Convert space item to Three.js object
 */
function convertSpaceItemToThreeJSObject(
  item: any, // SpaceAsset.space.items[0]
  options: ConversionOptions
): any {
  // Extract position, rotation, scale from matrix or direct values
  const position = item.position || [0, 0, 0];
  const rotation = item.rotation || [0, 0, 0];
  const scale = item.scale || [1, 1, 1];
  
  // Create transformation matrix
  const matrix = createTransformMatrix(position, rotation, scale);
  
  const threeObject = {
    uuid: item.id,
    type: getThreeJSTypeForAssetType(item.assetType),
    name: item.assetId,
    layers: 1,
    matrix: matrix,
    visible: item.visible !== false,
    castShadow: true,
    receiveShadow: true,
    geometry: `${item.assetType}-geometry-${item.assetId}`,
    material: `${item.assetType}-material-${item.assetId}`,
  };

  // Add asset-specific userData
  if (options.preserveUserData) {
    (threeObject as any).userData = {
      spaceItem: {
        assetId: item.assetId,
        assetType: item.assetType,
        opacity: item.opacity,
        clickable: item.clickable,
        hoverEffect: item.hoverEffect,
        objectProperties: item.objectProperties,
        groupId: item.groupId,
        importMetadata: item.importMetadata,
      },
      originalItem: item,
    };
  }

  return threeObject;
}

/**
 * Convert Three.js object back to space item
 */
function convertThreeJSObjectToSpaceItem(
  threeObject: any,
  scene: ThreeJSScene,
  options: ConversionOptions
): any {
  // Extract transform from matrix
  const transform = extractTransformFromMatrix(threeObject.matrix);
  
  // Get original space item data from userData if available
  const userData = threeObject.userData || {};
  const spaceItem = userData.spaceItem || {};
  const originalItem = userData.originalItem;
  
  return {
    id: threeObject.uuid,
    assetId: spaceItem.assetId || threeObject.name,
    assetType: spaceItem.assetType || inferAssetTypeFromThreeJSType(threeObject.type),
    position: transform.position,
    rotation: transform.rotation,
    scale: transform.scale,
    opacity: spaceItem.opacity || 1,
    visible: threeObject.visible !== false,
    clickable: spaceItem.clickable !== false,
    hoverEffect: spaceItem.hoverEffect || 'glow',
    objectProperties: spaceItem.objectProperties,
    groupId: spaceItem.groupId,
    importMetadata: spaceItem.importMetadata || {
      sourceType: 'manual',
      importTimestamp: new Date().toISOString(),
    },
  };
}

/**
 * Create transformation matrix from position, rotation, scale
 */
function createTransformMatrix(
  position: [number, number, number],
  rotation: [number, number, number],
  scale: [number, number, number]
): number[] {
  // Simplified matrix creation - in real implementation would use Three.js Matrix4
  return [
    scale[0], 0, 0, 0,
    0, scale[1], 0, 0,
    0, 0, scale[2], 0,
    position[0], position[1], position[2], 1
  ];
}

/**
 * Extract transform from Three.js matrix
 */
function extractTransformFromMatrix(matrix: number[]): {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
} {
  // Simplified extraction - in real implementation would use Three.js Matrix4.decompose()
  return {
    position: [matrix[12] || 0, matrix[13] || 0, matrix[14] || 0],
    rotation: [0, 0, 0], // Would extract from rotation matrix
    scale: [matrix[0] || 1, matrix[5] || 1, matrix[10] || 1],
  };
}

/**
 * Get Three.js object type for space asset type
 */
function getThreeJSTypeForAssetType(assetType: string): string {
  switch (assetType) {
    case 'image':
    case 'video':
      return 'Mesh'; // Plane with texture
    case 'object':
    case 'object_collection':
      return 'Group'; // Group of meshes
    case 'text':
      return 'Mesh'; // Text geometry
    default:
      return 'Object3D';
  }
}

/**
 * Infer space asset type from Three.js type
 */
function inferAssetTypeFromThreeJSType(threeType: string): string {
  switch (threeType) {
    case 'Mesh':
      return 'object'; // Default assumption
    case 'Group':
      return 'object_collection';
    case 'Object3D':
      return 'object';
    default:
      return 'object';
  }
}

/**
 * Generate geometry definition for asset type
 */
function generateGeometryForAssetType(assetType: string, geometryId: string): any {
  switch (assetType) {
    case 'image':
    case 'video':
      return {
        uuid: geometryId,
        type: "PlaneGeometry",
        width: 1,
        height: 1,
        widthSegments: 1,
        heightSegments: 1
      };
    case 'text':
      return {
        uuid: geometryId,
        type: "TextGeometry",
        text: "Text Asset",
        parameters: {
          font: "helvetiker_regular",
          size: 0.5,
          height: 0.1,
        }
      };
    default:
      return {
        uuid: geometryId,
        type: "BoxGeometry",
        width: 1,
        height: 1,
        depth: 1,
        widthSegments: 1,
        heightSegments: 1,
        depthSegments: 1
      };
  }
}

/**
 * Generate material definition for asset type
 */
function generateMaterialForAssetType(assetType: string, materialId: string): any {
  switch (assetType) {
    case 'image':
    case 'video':
      return {
        uuid: materialId,
        type: "MeshBasicMaterial",
        color: 16777215,
        transparent: true,
        opacity: 1,
        side: 2 // DoubleSide
      };
    case 'text':
      return {
        uuid: materialId,
        type: "MeshBasicMaterial",
        color: 16777215,
        transparent: false
      };
    default:
      return {
        uuid: materialId,
        type: "MeshStandardMaterial",
        color: 8947848,
        roughness: 0.5,
        metalness: 0.1
      };
  }
}

/**
 * Validate scene conversion integrity
 */
export function validateConversionIntegrity(
  originalSpace: SpaceAsset,
  convertedScene: ThreeJSScene,
  reconvertedSpace: SpaceAsset
): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check item count preservation
  const originalItemCount = originalSpace.space.items.length;
  const sceneChildCount = convertedScene.object.children.length;
  const reconvertedItemCount = reconvertedSpace.space.items.length;

  if (originalItemCount !== sceneChildCount) {
    errors.push(`Item count mismatch in space->scene: ${originalItemCount} -> ${sceneChildCount}`);
  }

  if (sceneChildCount !== reconvertedItemCount) {
    errors.push(`Item count mismatch in scene->space: ${sceneChildCount} -> ${reconvertedItemCount}`);
  }

  // Check position preservation (with tolerance for floating point)
  const POSITION_TOLERANCE = 0.001;
  
  for (let i = 0; i < Math.min(originalSpace.space.items.length, reconvertedSpace.space.items.length); i++) {
    const original = originalSpace.space.items[i];
    const reconverted = reconvertedSpace.space.items[i];
    
    for (let j = 0; j < 3; j++) {
      const originalPos = original.position[j];
      const reconvertedPos = reconverted.position[j];
      const diff = Math.abs(originalPos - reconvertedPos);
      
      if (diff > POSITION_TOLERANCE) {
        warnings.push(`Position drift for item ${original.id}: ${originalPos} -> ${reconvertedPos} (diff: ${diff})`);
      }
    }
  }

  // Check metadata preservation
  if (originalSpace.space.environment && reconvertedSpace.space.environment) {
    const originalBg = originalSpace.space.environment.backgroundColor;
    const reconvertedBg = reconvertedSpace.space.environment.backgroundColor;
    
    if (originalBg !== reconvertedBg) {
      warnings.push(`Environment background color changed: ${originalBg} -> ${reconvertedBg}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Test round-trip conversion
 */
export function testRoundTripConversion(spaceAsset: SpaceAsset): {
  success: boolean;
  errors: string[];
  performance: {
    spaceToScene: number;
    sceneToSpace: number;
    validation: number;
  };
} {
  const start = performance.now();
  
  try {
    // Space -> Scene
    const sceneStart = performance.now();
    const scene = convertSpaceToThreeJSScene(spaceAsset);
    const sceneTime = performance.now() - sceneStart;
    
    // Scene -> Space
    const spaceStart = performance.now();
    const reconvertedSpace = convertThreeJSSceneToSpace(scene, spaceAsset.id);
    const spaceTime = performance.now() - spaceStart;
    
    // Validation
    const validationStart = performance.now();
    const validation = validateConversionIntegrity(spaceAsset, scene, reconvertedSpace);
    const validationTime = performance.now() - validationStart;
    
    return {
      success: validation.valid,
      errors: validation.errors,
      performance: {
        spaceToScene: sceneTime,
        sceneToSpace: spaceTime,
        validation: validationTime,
      },
    };
  } catch (error) {
    return {
      success: false,
      errors: [error instanceof Error ? error.message : 'Unknown conversion error'],
      performance: {
        spaceToScene: 0,
        sceneToSpace: 0,
        validation: 0,
      },
    };
  }
}
