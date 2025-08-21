/**
 * Layout-to-Space Export Workflows
 * 
 * Implements the complete export workflow with versioning,
 * backup/restore, and manual edit preservation
 */

import { importLayoutToSpace, type LayoutImportConfig, type LayoutImportResult } from './layout-import';
import { 
  SpaceVersionManager, 
  generateSourceMappings, 
  getLayoutSourcedItems,
  generateVersionDescription,
  type SourceMapping,
  type SpaceVersion 
} from './version-management';
import { getMediaAsset, saveMediaAsset } from '../media-storage';
import type { LayoutAsset, SpaceAsset } from '../media-storage';

export interface ExportConfig extends LayoutImportConfig {
  createBackup?: boolean;
  preserveManualEdits?: boolean;
  conflictResolution?: 'preserve_manual' | 'use_layout' | 'prompt_user';
}

export interface ExportResult {
  spaceAsset: SpaceAsset;
  version: SpaceVersion;
  sourceMappings: SourceMapping[];
  backup?: any; // VersionBackup
  conflicts?: {
    items: string[];
    resolution: string;
  };
  summary: {
    itemsFromLayout: number;
    manualItemsPreserved: number;
    totalItems: number;
    isInitialExport: boolean;
  };
}

const DEFAULT_EXPORT_CONFIG: ExportConfig = {
  floorSize: 20,
  itemHeight: 0.1,
  groupingStrategy: 'flat',
  preserveAspectRatio: true,
  autoAnalyzeGrouping: true,
  createBackup: true,
  preserveManualEdits: true,
  conflictResolution: 'preserve_manual',
};

/**
 * Export layout to space (initial or re-export)
 */
export async function exportLayoutToSpace(
  layoutId: string,
  existingSpaceId?: string,
  config: ExportConfig = {}
): Promise<ExportResult> {
  const finalConfig = { ...DEFAULT_EXPORT_CONFIG, ...config };
  const versionManager = new SpaceVersionManager();

  // 1. Load layout
  const layout = await getMediaAsset(layoutId);
  if (!layout || layout.media_type !== 'layout') {
    throw new Error(`Layout not found: ${layoutId}`);
  }

  // 2. Load existing space if re-export
  let existingSpace: SpaceAsset | null = null;
  let isInitialExport = true;
  
  if (existingSpaceId) {
    existingSpace = await getMediaAsset(existingSpaceId);
    if (existingSpace && existingSpace.media_type === 'space') {
      isInitialExport = false;
    }
  }

  // 3. Create backup if requested and space exists
  let backup;
  if (!isInitialExport && existingSpace && finalConfig.createBackup) {
    backup = await versionManager.createBackup(
      existingSpace,
      `Pre-export backup before layout ${layoutId} re-export`
    );
  }

  // 4. Import layout to space coordinates
  const importResult: LayoutImportResult = await importLayoutToSpace(
    layout as LayoutAsset,
    finalConfig
  );

  // 5. Handle re-export merge if existing space
  let finalSpaceAsset: SpaceAsset;
  let preservedItems: string[] = [];
  let conflicts: { items: string[]; resolution: string } | undefined;

  if (!isInitialExport && existingSpace) {
    // Generate source mappings for the new import
    const newSourceMappings = generateSourceMappings(
      layoutId,
      importResult.spaceItems,
      (existingSpace.version || 1) + 1
    );

    // Merge with existing space
    const mergeResult = versionManager.mergeWithLayoutReExport(
      existingSpace,
      importResult.spaceItems,
      newSourceMappings
    );

    finalSpaceAsset = mergeResult.mergedSpace;
    preservedItems = mergeResult.preservedItems;

    if (mergeResult.conflictItems.length > 0) {
      conflicts = {
        items: mergeResult.conflictItems,
        resolution: finalConfig.conflictResolution || 'preserve_manual',
      };
    }
  } else {
    // Initial export - use imported space as-is
    finalSpaceAsset = {
      ...importResult.spaceAsset,
      id: existingSpaceId || importResult.spaceAsset.id,
    };
  }

  // 6. Generate source mappings
  const sourceMappings = generateSourceMappings(
    layoutId,
    finalSpaceAsset.space.items.filter(item => 
      item.importMetadata?.sourceType === 'layout' &&
      item.importMetadata?.sourceId === layoutId
    ),
    finalSpaceAsset.version || 1
  );

  // 7. Create version record
  const version = await versionManager.createVersion(
    finalSpaceAsset,
    isInitialExport ? 'initial_import' : 're_export',
    generateVersionDescription(
      isInitialExport ? 'initial_import' : 're_export',
      {
        layoutSourceId: layoutId,
        itemsAdded: importResult.importSummary.itemsImported,
        preservedManualItems: preservedItems,
      }
    ),
    sourceMappings,
    {
      layoutSourceId: layoutId,
      itemsAdded: importResult.importSummary.itemsImported,
      preservedManualItems: preservedItems,
    }
  );

  // 8. Save final space asset
  await saveMediaAsset(finalSpaceAsset);

  return {
    spaceAsset: finalSpaceAsset,
    version,
    sourceMappings,
    backup,
    conflicts,
    summary: {
      itemsFromLayout: importResult.importSummary.itemsImported,
      manualItemsPreserved: preservedItems.length,
      totalItems: finalSpaceAsset.space.items.length,
      isInitialExport,
    },
  };
}

/**
 * Re-export layout to existing space with conflict resolution
 */
export async function reExportLayoutToSpace(
  layoutId: string,
  spaceId: string,
  config: ExportConfig = {}
): Promise<ExportResult> {
  return exportLayoutToSpace(layoutId, spaceId, {
    ...config,
    createBackup: true, // Always create backup for re-exports
    preserveManualEdits: true, // Always preserve manual edits
  });
}

/**
 * Preview export without actually creating/updating the space
 */
export async function previewLayoutExport(
  layoutId: string,
  existingSpaceId?: string,
  config: ExportConfig = {}
): Promise<{
  itemCount: number;
  floorDimensions: { width: number; depth: number };
  groupingStrategy: string;
  conflicts?: {
    manualItemsAffected: number;
    layoutItemsUpdated: number;
  };
  estimatedChanges: {
    itemsAdded: number;
    itemsUpdated: number;
    itemsPreserved: number;
  };
}> {
  // Load layout
  const layout = await getMediaAsset(layoutId);
  if (!layout || layout.media_type !== 'layout') {
    throw new Error(`Layout not found: ${layoutId}`);
  }

  // Preview import
  const importResult = await importLayoutToSpace(layout as LayoutAsset, config);

  // Check for conflicts with existing space
  let conflicts;
  let estimatedChanges = {
    itemsAdded: importResult.importSummary.itemsImported,
    itemsUpdated: 0,
    itemsPreserved: 0,
  };

  if (existingSpaceId) {
    const existingSpace = await getMediaAsset(existingSpaceId);
    if (existingSpace && existingSpace.media_type === 'space') {
      const manualItems = (existingSpace as SpaceAsset).space.items.filter(item =>
        !item.importMetadata?.sourceType || item.importMetadata.sourceType !== 'layout'
      );
      
      const layoutItems = getLayoutSourcedItems(
        (existingSpace as SpaceAsset).space.items,
        layoutId
      );

      conflicts = {
        manualItemsAffected: 0, // Manual items are preserved
        layoutItemsUpdated: layoutItems.length,
      };

      estimatedChanges = {
        itemsAdded: Math.max(0, importResult.importSummary.itemsImported - layoutItems.length),
        itemsUpdated: layoutItems.length,
        itemsPreserved: manualItems.length,
      };
    }
  }

  return {
    itemCount: importResult.importSummary.itemsImported,
    floorDimensions: importResult.transformResult.floorDimensions,
    groupingStrategy: importResult.groupingAnalysis?.recommendedStrategy || 'flat',
    conflicts,
    estimatedChanges,
  };
}

/**
 * Batch export multiple layouts to spaces
 */
export async function batchExportLayouts(
  exports: Array<{
    layoutId: string;
    spaceId?: string;
    config?: ExportConfig;
  }>
): Promise<{
  results: ExportResult[];
  errors: Array<{ layoutId: string; error: string }>;
  summary: {
    successful: number;
    failed: number;
    totalItems: number;
  };
}> {
  const results: ExportResult[] = [];
  const errors: Array<{ layoutId: string; error: string }> = [];

  for (const exportRequest of exports) {
    try {
      const result = await exportLayoutToSpace(
        exportRequest.layoutId,
        exportRequest.spaceId,
        exportRequest.config
      );
      results.push(result);
    } catch (error) {
      errors.push({
        layoutId: exportRequest.layoutId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  const totalItems = results.reduce((sum, result) => sum + result.summary.totalItems, 0);

  return {
    results,
    errors,
    summary: {
      successful: results.length,
      failed: errors.length,
      totalItems,
    },
  };
}
