/**
 * Layout-to-Space Import System
 * 
 * Implements the complete layout-to-space conversion workflow
 * following the exact specifications from PHASE 3: SPATIAL WORK.md
 */

import { 
  transformLayoutToSpace, 
  type LayoutItem, 
  type LayoutDesignSize, 
  type SpaceItem,
  type TransformConfig,
  type TransformResult 
} from './coordinate-transform';

import { 
  applyGroupingStrategy, 
  analyzeLayoutForGrouping,
  type GroupingStrategy, 
  type GroupingConfig 
} from './grouping-algorithms';

// Import existing types
import type { SpaceAsset } from '../media-storage';

export interface LayoutAsset {
  id: string;
  filename: string;
  media_type: 'layout';
  layout: {
    designSize: LayoutDesignSize;
    items: LayoutItem[];
    version?: number;
    metadata?: Record<string, any>;
  };
  s3_url: string;
  cloudflare_url?: string;
  created_at: string;
  updated_at: string;
}

export interface LayoutImportConfig {
  floorSize?: number;
  itemHeight?: number;
  groupingStrategy?: GroupingStrategy;
  preserveAspectRatio?: boolean;
  autoAnalyzeGrouping?: boolean;
  generateThumbnail?: boolean;
}

export interface LayoutImportResult {
  spaceAsset: SpaceAsset;
  transformResult: TransformResult;
  groupingAnalysis?: {
    recommendedStrategy: GroupingStrategy;
    confidence: number;
    reasoning: string;
  };
  importSummary: {
    itemsImported: number;
    itemsSkipped: number;
    groupsCreated: number;
    floorDimensions: { width: number; depth: number };
  };
}

const DEFAULT_IMPORT_CONFIG: LayoutImportConfig = {
  floorSize: 20,
  itemHeight: 0.1,
  groupingStrategy: 'flat',
  preserveAspectRatio: true,
  autoAnalyzeGrouping: true,
  generateThumbnail: true,
};

/**
 * Import a layout into a 3D space
 * Main entry point for layout-to-space conversion
 */
export async function importLayoutToSpace(
  layout: LayoutAsset,
  config: LayoutImportConfig = {}
): Promise<LayoutImportResult> {
  const finalConfig = { ...DEFAULT_IMPORT_CONFIG, ...config };
  
  // Step 1: Transform 2D coordinates to 3D
  const transformResult = transformLayoutToSpace(
    layout.layout.items,
    layout.layout.designSize,
    {
      floorSize: finalConfig.floorSize,
      itemHeight: finalConfig.itemHeight,
      preserveAspectRatio: finalConfig.preserveAspectRatio,
    },
    layout.id
  );

  // Step 2: Analyze for optimal grouping if enabled
  let groupingAnalysis;
  let finalGroupingStrategy = finalConfig.groupingStrategy!;
  
  if (finalConfig.autoAnalyzeGrouping) {
    groupingAnalysis = analyzeLayoutForGrouping(transformResult.spaceItems);
    if (groupingAnalysis.confidence > 0.7) {
      finalGroupingStrategy = groupingAnalysis.recommendedStrategy;
    }
  }

  // Step 3: Apply grouping strategy
  const groupedItems = applyGroupingStrategy(transformResult.spaceItems, {
    strategy: finalGroupingStrategy,
  });

  // Step 4: Create space asset
  const spaceAsset = createSpaceAsset(layout, groupedItems, transformResult, finalConfig);

  // Step 5: Generate import summary
  const importSummary = {
    itemsImported: groupedItems.length,
    itemsSkipped: layout.layout.items.length - groupedItems.length,
    groupsCreated: countUniqueGroups(groupedItems),
    floorDimensions: transformResult.floorDimensions,
  };

  return {
    spaceAsset,
    transformResult: {
      ...transformResult,
      spaceItems: groupedItems,
    },
    groupingAnalysis,
    importSummary,
  };
}

/**
 * Create a SpaceAsset from imported layout data
 */
function createSpaceAsset(
  layout: LayoutAsset,
  spaceItems: SpaceItem[],
  transformResult: TransformResult,
  config: LayoutImportConfig
): SpaceAsset {
  const spaceId = generateSpaceId(layout.id);
  
  return {
    id: spaceId,
    filename: `${layout.filename.replace('.json', '')}_space.json`,
    media_type: 'space',
    space_type: 'gallery', // Default type for imported layouts
    metadata: {
      item_count: spaceItems.length,
    },
    space: {
      environment: {
        backgroundColor: '#111217',
        lighting: 'studio',
        fog: { color: '#000000', density: 0.01 },
      },
      camera: {
        position: [
          transformResult.floorDimensions.width * 0.6,
          transformResult.floorDimensions.width * 0.4,
          transformResult.floorDimensions.depth * 0.6,
        ],
        target: [0, 0, 0],
        fov: 50,
        controls: 'orbit',
      },
      items: spaceItems.map(item => ({
        id: item.id,
        assetId: item.assetId,
        assetType: item.assetType as any,
        position: item.position,
        rotation: item.rotation,
        scale: item.scale,
        opacity: item.opacity,
        visible: item.visible,
        clickable: true,
        hoverEffect: 'glow' as const,
        groupId: (item as any).groupId,
        importMetadata: {
          sourceType: 'layout' as const,
          sourceId: layout.id,
          importVersion: 1,
          importTimestamp: new Date().toISOString(),
          originalTransform: {
            position: item.position,
            rotation: item.rotation,
            scale: item.scale,
          },
        },
      })),
      relationships: [], // Can be enhanced later with spatial relationships
      zones: [], // Can be enhanced later with spatial zones
    },
    s3_url: `spaces/${spaceId}.json`, // Will be saved to S3
    processing_status: {
      created: 'completed' as const,
      spatial_preview: 'pending' as const,
      thumbnail: 'pending' as const,
    },
    timestamps: {
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/**
 * Generate a unique space ID from layout ID
 */
function generateSpaceId(layoutId: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `space_${layoutId}_${timestamp}_${random}`;
}

/**
 * Count unique groups in space items
 */
function countUniqueGroups(items: SpaceItem[]): number {
  const groups = new Set(items.map(item => (item as any).groupId).filter(Boolean));
  return groups.size;
}

/**
 * Validate layout before import
 */
export function validateLayoutForImport(layout: LayoutAsset): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check required fields
  if (!layout.layout?.designSize) {
    errors.push('Layout missing designSize');
  }

  if (!layout.layout?.items || layout.layout.items.length === 0) {
    errors.push('Layout has no items to import');
  }

  // Check design size validity
  if (layout.layout?.designSize) {
    const { width, height } = layout.layout.designSize;
    if (width <= 0 || height <= 0) {
      errors.push('Invalid designSize dimensions');
    }
    
    if (width > 10000 || height > 10000) {
      warnings.push('Very large layout dimensions may cause performance issues');
    }
  }

  // Check items validity
  if (layout.layout?.items) {
    layout.layout.items.forEach((item, index) => {
      if (!item.id) {
        errors.push(`Item ${index} missing required id`);
      }
      
      if (!item.contentType) {
        errors.push(`Item ${index} missing contentType`);
      }
      
      if (item.x < 0 || item.y < 0 || item.w <= 0 || item.h <= 0) {
        errors.push(`Item ${index} has invalid dimensions`);
      }
    });
  }

  // Performance warnings
  if (layout.layout?.items && layout.layout.items.length > 100) {
    warnings.push('Large number of items (>100) may impact 3D performance');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Preview import without creating the space asset
 */
export function previewLayoutImport(
  layout: LayoutAsset,
  config: LayoutImportConfig = {}
): {
  itemCount: number;
  estimatedFloorSize: { width: number; depth: number };
  recommendedGrouping: GroupingStrategy;
  transformPreview: {
    sampleItems: Array<{
      original: { x: number; y: number; w: number; h: number };
      transformed: { position: [number, number, number]; scale: [number, number, number] };
    }>;
  };
} {
  const finalConfig = { ...DEFAULT_IMPORT_CONFIG, ...config };
  
  // Calculate floor dimensions
  const aspectRatio = layout.layout.designSize.height / layout.layout.designSize.width;
  const floorWidth = finalConfig.floorSize!;
  const floorDepth = finalConfig.preserveAspectRatio ? floorWidth * aspectRatio : floorWidth;

  // Transform a few sample items for preview
  const sampleItems = layout.layout.items.slice(0, 3).map(item => {
    const transform = transformLayoutToSpace(
      [item],
      layout.layout.designSize,
      finalConfig,
      layout.id
    );
    
    return {
      original: { x: item.x, y: item.y, w: item.w, h: item.h },
      transformed: {
        position: transform.spaceItems[0].position,
        scale: transform.spaceItems[0].scale,
      },
    };
  });

  // Analyze for grouping recommendation
  const quickTransform = transformLayoutToSpace(
    layout.layout.items.slice(0, 10), // Sample for analysis
    layout.layout.designSize,
    finalConfig,
    layout.id
  );
  const groupingAnalysis = analyzeLayoutForGrouping(quickTransform.spaceItems);

  return {
    itemCount: layout.layout.items.length,
    estimatedFloorSize: { width: floorWidth, depth: floorDepth },
    recommendedGrouping: groupingAnalysis.recommendedStrategy,
    transformPreview: {
      sampleItems,
    },
  };
}
