/**
 * Version Management for Space Assets
 * 
 * Handles versioning, backup, and restore functionality for spaces
 * following the spec requirements for independent coordinate systems
 */

import type { SpaceAsset } from '../media-storage';

export interface SpaceVersion {
  version: number;
  timestamp: string;
  description: string;
  spaceData: SpaceAsset;
  sourceMappings?: SourceMapping[];
  changeType: 'initial_import' | 're_export' | 'manual_edit' | 'bulk_update';
  changeMetadata?: {
    itemsAdded?: number;
    itemsRemoved?: number;
    itemsModified?: number;
    layoutSourceId?: string;
    preservedManualItems?: string[];
  };
}

export interface SourceMapping {
  sourceType: 'layout';
  sourceId: string;
  layoutItemId: string;
  spaceItemId: string;
  importVersion: number;
  lastSyncTimestamp: string;
}

export interface VersionHistory {
  spaceId: string;
  currentVersion: number;
  versions: SpaceVersion[];
  maxVersions: number;
}

export interface VersionBackup {
  id: string;
  spaceId: string;
  version: number;
  backupData: SpaceAsset;
  createdAt: string;
  s3Key: string;
}

const DEFAULT_MAX_VERSIONS = 10;

/**
 * Version Manager class for space asset versioning
 */
export class SpaceVersionManager {
  private maxVersions: number;

  constructor(maxVersions = DEFAULT_MAX_VERSIONS) {
    this.maxVersions = maxVersions;
  }

  /**
   * Create a new version of a space
   */
  async createVersion(
    spaceAsset: SpaceAsset,
    changeType: SpaceVersion['changeType'],
    description: string,
    sourceMappings?: SourceMapping[],
    changeMetadata?: SpaceVersion['changeMetadata']
  ): Promise<SpaceVersion> {
    const currentHistory = await this.getVersionHistory(spaceAsset.id);
    const newVersion = currentHistory.currentVersion + 1;

    const version: SpaceVersion = {
      version: newVersion,
      timestamp: new Date().toISOString(),
      description,
      spaceData: { ...spaceAsset },
      sourceMappings,
      changeType,
      changeMetadata,
    };

    // Update space asset with new version
    const versionedSpace = {
      ...spaceAsset,
      version: newVersion,
      updated_at: new Date().toISOString(),
    };

    return version;
  }

  /**
   * Get version history for a space
   */
  async getVersionHistory(spaceId: string): Promise<VersionHistory> {
    // In a real implementation, this would load from S3 or database
    // For now, return a mock history
    return {
      spaceId,
      currentVersion: 0,
      versions: [],
      maxVersions: this.maxVersions,
    };
  }

  /**
   * Create backup before major changes
   */
  async createBackup(
    spaceAsset: SpaceAsset,
    description: string
  ): Promise<VersionBackup> {
    const backupId = `backup_${spaceAsset.id}_${Date.now()}`;
    const s3Key = `spaces/backups/${spaceAsset.id}/${backupId}.json`;

    const backup: VersionBackup = {
      id: backupId,
      spaceId: spaceAsset.id,
      version: spaceAsset.version || 1,
      backupData: { ...spaceAsset },
      createdAt: new Date().toISOString(),
      s3Key,
    };

    // In a real implementation, save backup to S3
    console.log(`Created backup: ${backupId}`);

    return backup;
  }

  /**
   * Restore space from backup
   */
  async restoreFromBackup(
    backupId: string
  ): Promise<SpaceAsset> {
    // In a real implementation, load backup from S3
    throw new Error('Restore functionality not yet implemented');
  }

  /**
   * Clean up old versions beyond maxVersions limit
   */
  async cleanupOldVersions(spaceId: string): Promise<number> {
    const history = await this.getVersionHistory(spaceId);
    
    if (history.versions.length <= this.maxVersions) {
      return 0; // No cleanup needed
    }

    const versionsToRemove = history.versions
      .sort((a, b) => a.version - b.version)
      .slice(0, history.versions.length - this.maxVersions);

    // In a real implementation, delete old versions from S3
    console.log(`Would cleanup ${versionsToRemove.length} old versions`);

    return versionsToRemove.length;
  }

  /**
   * Compare two space versions to identify changes
   */
  compareVersions(
    oldVersion: SpaceAsset,
    newVersion: SpaceAsset
  ): {
    itemsAdded: string[];
    itemsRemoved: string[];
    itemsModified: Array<{
      id: string;
      changes: string[];
    }>;
    summary: string;
  } {
    const oldItems = new Map(oldVersion.space.items.map(item => [item.id, item]));
    const newItems = new Map(newVersion.space.items.map(item => [item.id, item]));

    const itemsAdded = Array.from(newItems.keys()).filter(id => !oldItems.has(id));
    const itemsRemoved = Array.from(oldItems.keys()).filter(id => !newItems.has(id));
    const itemsModified: Array<{ id: string; changes: string[] }> = [];

    // Check for modifications
    for (const [id, newItem] of newItems) {
      const oldItem = oldItems.get(id);
      if (oldItem) {
        const changes: string[] = [];
        
        // Check position changes
        if (JSON.stringify(oldItem.position) !== JSON.stringify(newItem.position)) {
          changes.push('position');
        }
        
        // Check rotation changes
        if (JSON.stringify(oldItem.rotation) !== JSON.stringify(newItem.rotation)) {
          changes.push('rotation');
        }
        
        // Check scale changes
        if (JSON.stringify(oldItem.scale) !== JSON.stringify(newItem.scale)) {
          changes.push('scale');
        }
        
        // Check visibility changes
        if (oldItem.visible !== newItem.visible) {
          changes.push('visibility');
        }

        if (changes.length > 0) {
          itemsModified.push({ id, changes });
        }
      }
    }

    const summary = `${itemsAdded.length} added, ${itemsRemoved.length} removed, ${itemsModified.length} modified`;

    return {
      itemsAdded,
      itemsRemoved,
      itemsModified,
      summary,
    };
  }

  /**
   * Merge manual edits with layout re-export
   */
  mergeWithLayoutReExport(
    currentSpace: SpaceAsset,
    newLayoutItems: any[], // Items from layout re-export
    sourceMappings: SourceMapping[]
  ): {
    mergedSpace: SpaceAsset;
    preservedItems: string[];
    updatedItems: string[];
    conflictItems: string[];
  } {
    const sourceMappingMap = new Map(sourceMappings.map(sm => [sm.spaceItemId, sm]));
    const preservedItems: string[] = [];
    const updatedItems: string[] = [];
    const conflictItems: string[] = [];

    // Separate manually added items from layout-sourced items
    const manualItems = currentSpace.space.items.filter(item => {
      return !sourceMappingMap.has(item.id);
    });

    // Update layout-sourced items with new coordinates
    const layoutSourcedItems = newLayoutItems.map(newItem => {
      const existingMapping = Array.from(sourceMappingMap.values())
        .find(sm => sm.layoutItemId === newItem.importMetadata?.originalItemId);

      if (existingMapping) {
        // Update existing item
        const existingItem = currentSpace.space.items.find(item => item.id === existingMapping.spaceItemId);
        if (existingItem) {
          // Check for conflicts (manual edits vs layout changes)
          const hasManualEdits = existingItem.importMetadata?.originalTransform &&
            JSON.stringify(existingItem.position) !== JSON.stringify(existingItem.importMetadata.originalTransform.position);

          if (hasManualEdits) {
            conflictItems.push(existingItem.id);
            // Keep manual edits, don't update from layout
            preservedItems.push(existingItem.id);
            return existingItem;
          } else {
            // Update from layout
            updatedItems.push(existingItem.id);
            return {
              ...existingItem,
              ...newItem,
              id: existingItem.id, // Preserve space item ID
            };
          }
        }
      }

      // New item from layout
      return newItem;
    });

    const mergedSpace: SpaceAsset = {
      ...currentSpace,
      space: {
        ...currentSpace.space,
        items: [
          ...manualItems, // Preserve all manually added items
          ...layoutSourcedItems, // Update layout-sourced items
        ],
      },
      version: (currentSpace.version || 1) + 1,
      updated_at: new Date().toISOString(),
    };

    return {
      mergedSpace,
      preservedItems: [...preservedItems, ...manualItems.map(item => item.id)],
      updatedItems,
      conflictItems,
    };
  }
}

// Global version manager instance
export const globalVersionManager = new SpaceVersionManager();

/**
 * Utility functions for version management
 */

/**
 * Generate source mappings for layout import
 */
export function generateSourceMappings(
  layoutId: string,
  spaceItems: any[], // SpaceItems from layout import
  importVersion: number = 1
): SourceMapping[] {
  return spaceItems
    .filter(item => item.importMetadata?.originalLayoutId === layoutId)
    .map(item => ({
      sourceType: 'layout' as const,
      sourceId: layoutId,
      layoutItemId: item.importMetadata.originalItemId,
      spaceItemId: item.id,
      importVersion,
      lastSyncTimestamp: new Date().toISOString(),
    }));
}

/**
 * Check if a space item was manually added (not from layout import)
 */
export function isManuallyAddedItem(item: any): boolean {
  return !item.importMetadata?.sourceType || 
         item.importMetadata.sourceType !== 'layout';
}

/**
 * Get items that originated from a specific layout
 */
export function getLayoutSourcedItems(
  spaceItems: any[],
  layoutId: string
): any[] {
  return spaceItems.filter(item => 
    item.importMetadata?.sourceType === 'layout' &&
    item.importMetadata?.sourceId === layoutId
  );
}

/**
 * Calculate version compatibility
 */
export function isVersionCompatible(
  spaceVersion: number,
  layoutVersion: number,
  maxVersionDrift: number = 5
): boolean {
  return Math.abs(spaceVersion - layoutVersion) <= maxVersionDrift;
}

/**
 * Generate version description based on change type
 */
export function generateVersionDescription(
  changeType: SpaceVersion['changeType'],
  changeMetadata?: SpaceVersion['changeMetadata']
): string {
  switch (changeType) {
    case 'initial_import':
      return `Initial import from layout ${changeMetadata?.layoutSourceId || 'unknown'}`;
    
    case 're_export':
      const preserved = changeMetadata?.preservedManualItems?.length || 0;
      return `Re-exported from layout (${preserved} manual items preserved)`;
    
    case 'manual_edit':
      const modified = changeMetadata?.itemsModified || 0;
      return `Manual edits: ${modified} items modified`;
    
    case 'bulk_update':
      const added = changeMetadata?.itemsAdded || 0;
      const removed = changeMetadata?.itemsRemoved || 0;
      return `Bulk update: +${added} -${removed} items`;
    
    default:
      return 'Version update';
  }
}
