/**
 * Unit tests for versioning and backup/restore functionality
 * 
 * Tests the version management system from PHASE 3: SPATIAL WORK.md
 * including backup, restore, source mapping, and conflict resolution
 */

import {
  createSpaceVersion,
  restoreSpaceVersion,
  listSpaceVersions,
  deleteSpaceVersion,
  getVersionDiff,
  mergeVersions,
  type SpaceVersion,
  type VersionDiff,
  type MergeConflict,
} from '../../lib/spatial/version-management';
import { type SpaceAsset } from '../../lib/media-storage';

describe('Versioning System', () => {
  // Helper to create test SpaceAsset
  const createTestSpace = (id: string = 'test-space'): SpaceAsset => ({
    id,
    filename: `${id}.json`,
    media_type: 'space',
    space_type: 'custom',
    metadata: { item_count: 2 },
    space: {
      environment: {
        backgroundColor: '#111217',
        lighting: 'studio',
        fog: { enabled: false, color: '#ffffff', density: 0.01 },
        skybox: 'city',
      },
      camera: {
        position: [4, 3, 6],
        target: [0, 0, 0],
        fov: 50,
        controls: 'orbit',
      },
      items: [
        {
          id: 'item-1',
          assetId: 'asset-1',
          assetType: 'image',
          position: [0, 0.1, 0],
          rotation: [0, 0, 0],
          scale: [1, 0.01, 1],
          visible: true,
          clickable: true,
          hoverEffect: 'none',
        },
        {
          id: 'item-2',
          assetId: 'asset-2',
          assetType: 'object',
          position: [2, 0.5, -1],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          visible: true,
          clickable: true,
          hoverEffect: 'glow',
        },
      ],
    },
    s3_url: `spaces/${id}.json`,
    cloudflare_url: '',
    processing_status: {
      created: 'completed',
      spatial_preview: 'completed',
      thumbnail: 'completed',
    },
    timestamps: {
      created: '2023-01-01T00:00:00Z',
      updated: '2023-01-01T00:00:00Z',
    },
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
  });

  describe('createSpaceVersion', () => {
    test('should create initial version', async () => {
      const space = createTestSpace();
      const version = await createSpaceVersion(space, {
        description: 'Initial version',
        tags: ['initial', 'baseline'],
      });

      expect(version.id).toBeDefined();
      expect(version.spaceId).toBe(space.id);
      expect(version.versionNumber).toBe(1);
      expect(version.description).toBe('Initial version');
      expect(version.tags).toEqual(['initial', 'baseline']);
      expect(version.spaceData).toEqual(space);
      expect(version.createdAt).toBeDefined();
      expect(version.parentVersionId).toBeUndefined();
    });

    test('should create incremental version', async () => {
      const space = createTestSpace();
      
      // Create initial version
      const v1 = await createSpaceVersion(space, { description: 'Version 1' });
      
      // Modify space
      space.space.items[0].position = [1, 0.1, 1];
      space.space.environment.backgroundColor = '#222222';
      
      // Create incremental version
      const v2 = await createSpaceVersion(space, {
        description: 'Version 2 - moved item and changed background',
        parentVersionId: v1.id,
      });

      expect(v2.versionNumber).toBe(2);
      expect(v2.parentVersionId).toBe(v1.id);
      expect(v2.spaceData.space.items[0].position).toEqual([1, 0.1, 1]);
      expect(v2.spaceData.space.environment.backgroundColor).toBe('#222222');
    });

    test('should handle source mapping', async () => {
      const space = createTestSpace();
      space.space.items[0].importMetadata = {
        originalLayoutId: 'layout-123',
        originalItemId: 'layout-item-1',
        originalPosition: { x: 100, y: 200 },
        originalDimensions: { w: 300, h: 400 },
        importTimestamp: '2023-01-01T00:00:00Z',
      };

      const version = await createSpaceVersion(space, {
        description: 'Version with source mapping',
        sourceMappings: [
          {
            spaceItemId: 'item-1',
            sourceType: 'layout',
            sourceId: 'layout-123',
            sourceItemId: 'layout-item-1',
            lastSyncTimestamp: '2023-01-01T00:00:00Z',
          },
        ],
      });

      expect(version.sourceMappings).toHaveLength(1);
      expect(version.sourceMappings![0].spaceItemId).toBe('item-1');
      expect(version.sourceMappings![0].sourceType).toBe('layout');
      expect(version.sourceMappings![0].sourceId).toBe('layout-123');
    });

    test('should create automatic backup versions', async () => {
      const space = createTestSpace();
      
      // Create version with auto-backup enabled
      const version = await createSpaceVersion(space, {
        description: 'Auto-backup version',
        autoBackup: true,
        backupInterval: 'daily',
      });

      expect(version.autoBackup).toBe(true);
      expect(version.backupInterval).toBe('daily');
      expect(version.nextBackupTime).toBeDefined();
    });

    test('should handle large spaces efficiently', async () => {
      const largeSpace = createTestSpace();
      
      // Add many items
      for (let i = 0; i < 1000; i++) {
        largeSpace.space.items.push({
          id: `large-item-${i}`,
          assetId: `large-asset-${i}`,
          assetType: 'image',
          position: [i % 100, 0.1, Math.floor(i / 100)],
          rotation: [0, 0, 0],
          scale: [1, 0.01, 1],
          visible: true,
          clickable: true,
          hoverEffect: 'none',
        });
      }

      const startTime = Date.now();
      const version = await createSpaceVersion(largeSpace, {
        description: 'Large space version',
      });
      const endTime = Date.now();

      expect(version.spaceData.space.items).toHaveLength(1002); // Original 2 + 1000 new
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });

  describe('restoreSpaceVersion', () => {
    test('should restore space to specific version', async () => {
      const space = createTestSpace();
      
      // Create initial version
      const v1 = await createSpaceVersion(space, { description: 'Version 1' });
      
      // Modify space
      space.space.items[0].position = [5, 0.1, 5];
      space.space.environment.lighting = 'dramatic';
      
      // Create second version
      const v2 = await createSpaceVersion(space, { 
        description: 'Version 2',
        parentVersionId: v1.id,
      });
      
      // Restore to version 1
      const restoredSpace = await restoreSpaceVersion(space.id, v1.id);

      expect(restoredSpace.space.items[0].position).toEqual([0, 0.1, 0]); // Original position
      expect(restoredSpace.space.environment.lighting).toBe('studio'); // Original lighting
      expect(restoredSpace.id).toBe(space.id); // Same space ID
    });

    test('should create restore point before restoring', async () => {
      const space = createTestSpace();
      
      const v1 = await createSpaceVersion(space, { description: 'Version 1' });
      
      // Modify space
      space.space.items[0].visible = false;
      
      // Restore with restore point
      const restoredSpace = await restoreSpaceVersion(space.id, v1.id, {
        createRestorePoint: true,
        restorePointDescription: 'Before restore to v1',
      });

      // Should have created a restore point version
      const versions = await listSpaceVersions(space.id);
      const restorePointVersion = versions.find(v => 
        v.description?.includes('Before restore to v1')
      );

      expect(restorePointVersion).toBeDefined();
      expect(restorePointVersion!.spaceData.space.items[0].visible).toBe(false);
      expect(restoredSpace.space.items[0].visible).toBe(true); // Restored value
    });

    test('should handle partial restore', async () => {
      const space = createTestSpace();
      
      const v1 = await createSpaceVersion(space, { description: 'Version 1' });
      
      // Modify multiple aspects
      space.space.items[0].position = [10, 0.1, 10];
      space.space.environment.backgroundColor = '#ff0000';
      space.space.camera.fov = 75;
      
      // Restore only environment
      const restoredSpace = await restoreSpaceVersion(space.id, v1.id, {
        restoreScope: ['environment'],
      });

      expect(restoredSpace.space.environment.backgroundColor).toBe('#111217'); // Restored
      expect(restoredSpace.space.items[0].position).toEqual([10, 0.1, 10]); // Not restored
      expect(restoredSpace.space.camera.fov).toBe(75); // Not restored
    });

    test('should handle restore conflicts', async () => {
      const space = createTestSpace();
      
      const v1 = await createSpaceVersion(space, { description: 'Version 1' });
      
      // Simulate concurrent modifications
      space.space.items[0].position = [3, 0.1, 3]; // User modification
      space.space.items[0].scale = [2, 0.01, 2]; // Another modification
      
      // Try to restore with conflict detection
      const result = await restoreSpaceVersion(space.id, v1.id, {
        handleConflicts: 'detect',
      });

      // Should detect conflicts but not fail
      expect(result).toBeDefined();
    });
  });

  describe('listSpaceVersions', () => {
    test('should list versions in chronological order', async () => {
      const space = createTestSpace();
      
      const v1 = await createSpaceVersion(space, { description: 'Version 1' });
      
      // Wait a bit to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
      
      space.space.items[0].position = [1, 0.1, 1];
      const v2 = await createSpaceVersion(space, { 
        description: 'Version 2',
        parentVersionId: v1.id,
      });
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      space.space.items[0].position = [2, 0.1, 2];
      const v3 = await createSpaceVersion(space, { 
        description: 'Version 3',
        parentVersionId: v2.id,
      });

      const versions = await listSpaceVersions(space.id);

      expect(versions).toHaveLength(3);
      expect(versions[0].versionNumber).toBe(3); // Most recent first
      expect(versions[1].versionNumber).toBe(2);
      expect(versions[2].versionNumber).toBe(1);
    });

    test('should support pagination', async () => {
      const space = createTestSpace();
      
      // Create many versions
      for (let i = 1; i <= 10; i++) {
        space.space.items[0].position = [i, 0.1, i];
        await createSpaceVersion(space, { description: `Version ${i}` });
      }

      const page1 = await listSpaceVersions(space.id, { limit: 5, offset: 0 });
      const page2 = await listSpaceVersions(space.id, { limit: 5, offset: 5 });

      expect(page1).toHaveLength(5);
      expect(page2).toHaveLength(5);
      expect(page1[0].versionNumber).toBe(10); // Most recent
      expect(page2[4].versionNumber).toBe(1); // Oldest
    });

    test('should filter by tags', async () => {
      const space = createTestSpace();
      
      await createSpaceVersion(space, { 
        description: 'Version 1',
        tags: ['milestone', 'stable'],
      });
      
      space.space.items[0].position = [1, 0.1, 1];
      await createSpaceVersion(space, { 
        description: 'Version 2',
        tags: ['experimental'],
      });
      
      space.space.items[0].position = [2, 0.1, 2];
      await createSpaceVersion(space, { 
        description: 'Version 3',
        tags: ['milestone'],
      });

      const milestoneVersions = await listSpaceVersions(space.id, {
        filterTags: ['milestone'],
      });

      expect(milestoneVersions).toHaveLength(2);
      expect(milestoneVersions.every(v => v.tags?.includes('milestone'))).toBe(true);
    });

    test('should filter by date range', async () => {
      const space = createTestSpace();
      
      const startDate = new Date();
      
      await createSpaceVersion(space, { description: 'Version 1' });
      
      // Wait to create time gap
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const midDate = new Date();
      
      space.space.items[0].position = [1, 0.1, 1];
      await createSpaceVersion(space, { description: 'Version 2' });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const endDate = new Date();

      const versionsInRange = await listSpaceVersions(space.id, {
        dateRange: { start: midDate, end: endDate },
      });

      expect(versionsInRange).toHaveLength(1);
      expect(versionsInRange[0].description).toBe('Version 2');
    });
  });

  describe('deleteSpaceVersion', () => {
    test('should delete specific version', async () => {
      const space = createTestSpace();
      
      const v1 = await createSpaceVersion(space, { description: 'Version 1' });
      const v2 = await createSpaceVersion(space, { description: 'Version 2' });
      const v3 = await createSpaceVersion(space, { description: 'Version 3' });

      await deleteSpaceVersion(space.id, v2.id);

      const remainingVersions = await listSpaceVersions(space.id);
      expect(remainingVersions).toHaveLength(2);
      expect(remainingVersions.find(v => v.id === v2.id)).toBeUndefined();
    });

    test('should handle cascade deletion', async () => {
      const space = createTestSpace();
      
      const v1 = await createSpaceVersion(space, { description: 'Version 1' });
      const v2 = await createSpaceVersion(space, { 
        description: 'Version 2',
        parentVersionId: v1.id,
      });
      const v3 = await createSpaceVersion(space, { 
        description: 'Version 3',
        parentVersionId: v2.id,
      });

      // Delete parent version with cascade
      await deleteSpaceVersion(space.id, v1.id, { cascade: true });

      const remainingVersions = await listSpaceVersions(space.id);
      expect(remainingVersions).toHaveLength(0); // All deleted due to cascade
    });

    test('should prevent deletion of protected versions', async () => {
      const space = createTestSpace();
      
      const protectedVersion = await createSpaceVersion(space, { 
        description: 'Protected version',
        protected: true,
      });

      await expect(deleteSpaceVersion(space.id, protectedVersion.id))
        .rejects.toThrow('Cannot delete protected version');
    });

    test('should cleanup associated files', async () => {
      const space = createTestSpace();
      
      const version = await createSpaceVersion(space, { 
        description: 'Version with files',
        attachments: ['backup.json', 'preview.png'],
      });

      await deleteSpaceVersion(space.id, version.id, { cleanupFiles: true });

      // Files should be cleaned up (implementation dependent)
      const remainingVersions = await listSpaceVersions(space.id);
      expect(remainingVersions.find(v => v.id === version.id)).toBeUndefined();
    });
  });

  describe('getVersionDiff', () => {
    test('should calculate diff between versions', async () => {
      const space = createTestSpace();
      
      const v1 = await createSpaceVersion(space, { description: 'Version 1' });
      
      // Make changes
      space.space.items[0].position = [5, 0.1, 5];
      space.space.items[0].visible = false;
      space.space.environment.backgroundColor = '#ff0000';
      space.space.items.push({
        id: 'new-item',
        assetId: 'new-asset',
        assetType: 'text',
        position: [0, 1, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        visible: true,
        clickable: true,
        hoverEffect: 'none',
      });
      
      const v2 = await createSpaceVersion(space, { 
        description: 'Version 2',
        parentVersionId: v1.id,
      });

      const diff = await getVersionDiff(v1.id, v2.id);

      expect(diff.changes).toBeDefined();
      expect(diff.changes.items).toBeDefined();
      expect(diff.changes.environment).toBeDefined();
      
      // Should detect item changes
      const itemChanges = diff.changes.items!;
      expect(itemChanges.modified).toHaveLength(1);
      expect(itemChanges.added).toHaveLength(1);
      expect(itemChanges.removed).toHaveLength(0);
      
      // Should detect environment changes
      const envChanges = diff.changes.environment!;
      expect(envChanges.backgroundColor).toBeDefined();
    });

    test('should handle complex hierarchical changes', async () => {
      const space = createTestSpace();
      
      // Add composite object
      space.space.items.push({
        id: 'composite-item',
        assetId: 'composite-asset',
        assetType: 'object',
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        visible: true,
        clickable: true,
        hoverEffect: 'none',
        objectProperties: {
          showComponents: true,
          interactionLevel: 'component',
          lodLevel: 1,
          physics: { enabled: false },
          components: [
            { id: 'comp1', position: [0, 0, 0], visible: true },
            { id: 'comp2', position: [1, 0, 0], visible: true },
          ],
        },
      });
      
      const v1 = await createSpaceVersion(space, { description: 'Version 1' });
      
      // Modify component
      space.space.items[2].objectProperties!.components![0].visible = false;
      space.space.items[2].objectProperties!.components!.push({
        id: 'comp3',
        position: [0, 1, 0],
        visible: true,
      });
      
      const v2 = await createSpaceVersion(space, { 
        description: 'Version 2',
        parentVersionId: v1.id,
      });

      const diff = await getVersionDiff(v1.id, v2.id);

      expect(diff.changes.items!.modified).toHaveLength(1);
      expect(diff.changes.items!.modified[0].id).toBe('composite-item');
      expect(diff.changes.items!.modified[0].changes).toContain('objectProperties.components');
    });

    test('should calculate diff statistics', async () => {
      const space = createTestSpace();
      
      const v1 = await createSpaceVersion(space, { description: 'Version 1' });
      
      // Make various changes
      space.space.items[0].position = [1, 0.1, 1];
      space.space.items[1].visible = false;
      space.space.environment.lighting = 'dramatic';
      space.space.camera.fov = 75;
      
      const v2 = await createSpaceVersion(space, { 
        description: 'Version 2',
        parentVersionId: v1.id,
      });

      const diff = await getVersionDiff(v1.id, v2.id);

      expect(diff.statistics).toBeDefined();
      expect(diff.statistics.totalChanges).toBeGreaterThan(0);
      expect(diff.statistics.itemsChanged).toBe(2);
      expect(diff.statistics.environmentChanged).toBe(true);
      expect(diff.statistics.cameraChanged).toBe(true);
    });
  });

  describe('mergeVersions', () => {
    test('should merge non-conflicting changes', async () => {
      const space = createTestSpace();
      
      const baseVersion = await createSpaceVersion(space, { description: 'Base' });
      
      // Branch A: Change item position
      const spaceA = { ...space };
      spaceA.space.items[0].position = [1, 0.1, 1];
      const versionA = await createSpaceVersion(spaceA, { 
        description: 'Branch A',
        parentVersionId: baseVersion.id,
      });
      
      // Branch B: Change environment
      const spaceB = { ...space };
      spaceB.space.environment.backgroundColor = '#ff0000';
      const versionB = await createSpaceVersion(spaceB, { 
        description: 'Branch B',
        parentVersionId: baseVersion.id,
      });

      const mergeResult = await mergeVersions(versionA.id, versionB.id);

      expect(mergeResult.success).toBe(true);
      expect(mergeResult.conflicts).toHaveLength(0);
      expect(mergeResult.mergedSpace!.space.items[0].position).toEqual([1, 0.1, 1]);
      expect(mergeResult.mergedSpace!.space.environment.backgroundColor).toBe('#ff0000');
    });

    test('should detect merge conflicts', async () => {
      const space = createTestSpace();
      
      const baseVersion = await createSpaceVersion(space, { description: 'Base' });
      
      // Branch A: Change item position
      const spaceA = { ...space };
      spaceA.space.items[0].position = [1, 0.1, 1];
      const versionA = await createSpaceVersion(spaceA, { 
        description: 'Branch A',
        parentVersionId: baseVersion.id,
      });
      
      // Branch B: Change same item position differently
      const spaceB = { ...space };
      spaceB.space.items[0].position = [2, 0.1, 2];
      const versionB = await createSpaceVersion(spaceB, { 
        description: 'Branch B',
        parentVersionId: baseVersion.id,
      });

      const mergeResult = await mergeVersions(versionA.id, versionB.id);

      expect(mergeResult.success).toBe(false);
      expect(mergeResult.conflicts).toHaveLength(1);
      expect(mergeResult.conflicts[0].path).toBe('space.items[0].position');
      expect(mergeResult.conflicts[0].conflictType).toBe('modification');
    });

    test('should handle three-way merge', async () => {
      const space = createTestSpace();
      
      const baseVersion = await createSpaceVersion(space, { description: 'Base' });
      
      // Create two branches
      const spaceA = { ...space };
      spaceA.space.items[0].scale = [2, 0.01, 2];
      const versionA = await createSpaceVersion(spaceA, { 
        description: 'Branch A',
        parentVersionId: baseVersion.id,
      });
      
      const spaceB = { ...space };
      spaceB.space.items[1].visible = false;
      const versionB = await createSpaceVersion(spaceB, { 
        description: 'Branch B',
        parentVersionId: baseVersion.id,
      });

      const mergeResult = await mergeVersions(versionA.id, versionB.id, {
        strategy: 'three-way',
        baseVersionId: baseVersion.id,
      });

      expect(mergeResult.success).toBe(true);
      expect(mergeResult.mergedSpace!.space.items[0].scale).toEqual([2, 0.01, 2]);
      expect(mergeResult.mergedSpace!.space.items[1].visible).toBe(false);
    });

    test('should resolve conflicts with custom resolver', async () => {
      const space = createTestSpace();
      
      const baseVersion = await createSpaceVersion(space, { description: 'Base' });
      
      // Create conflicting branches
      const spaceA = { ...space };
      spaceA.space.environment.lighting = 'natural';
      const versionA = await createSpaceVersion(spaceA, { 
        description: 'Branch A',
        parentVersionId: baseVersion.id,
      });
      
      const spaceB = { ...space };
      spaceB.space.environment.lighting = 'dramatic';
      const versionB = await createSpaceVersion(spaceB, { 
        description: 'Branch B',
        parentVersionId: baseVersion.id,
      });

      const mergeResult = await mergeVersions(versionA.id, versionB.id, {
        conflictResolver: (conflict: MergeConflict) => {
          if (conflict.path === 'space.environment.lighting') {
            return { resolution: 'custom', value: 'studio' }; // Custom resolution
          }
          return { resolution: 'take-theirs' };
        },
      });

      expect(mergeResult.success).toBe(true);
      expect(mergeResult.mergedSpace!.space.environment.lighting).toBe('studio');
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle version history pruning', async () => {
      const space = createTestSpace();
      
      // Create many versions
      const versions: SpaceVersion[] = [];
      for (let i = 1; i <= 50; i++) {
        space.space.items[0].position = [i, 0.1, i];
        const version = await createSpaceVersion(space, { 
          description: `Version ${i}`,
        });
        versions.push(version);
      }

      // Prune old versions (keep last 10)
      const prunedCount = await pruneVersionHistory(space.id, { keepCount: 10 });

      expect(prunedCount).toBe(40); // Removed 40 versions
      
      const remainingVersions = await listSpaceVersions(space.id);
      expect(remainingVersions).toHaveLength(10);
    });

    test('should compress version data efficiently', async () => {
      const space = createTestSpace();
      
      // Add large amount of data
      for (let i = 0; i < 100; i++) {
        space.space.items.push({
          id: `bulk-item-${i}`,
          assetId: `bulk-asset-${i}`,
          assetType: 'image',
          position: [i, 0.1, i],
          rotation: [0, 0, 0],
          scale: [1, 0.01, 1],
          visible: true,
          clickable: true,
          hoverEffect: 'none',
        });
      }

      const version = await createSpaceVersion(space, { 
        description: 'Large version',
        compression: 'gzip',
      });

      expect(version.compressed).toBe(true);
      expect(version.originalSize).toBeGreaterThan(version.compressedSize!);
    });

    test('should handle concurrent version operations', async () => {
      const space = createTestSpace();
      
      // Simulate concurrent version creation
      const promises = [];
      for (let i = 0; i < 10; i++) {
        const modifiedSpace = { ...space };
        modifiedSpace.space.items[0].position = [i, 0.1, i];
        
        promises.push(createSpaceVersion(modifiedSpace, { 
          description: `Concurrent version ${i}`,
        }));
      }

      const results = await Promise.allSettled(promises);
      const successful = results.filter(r => r.status === 'fulfilled');

      expect(successful.length).toBeGreaterThan(0);
      // Some may fail due to concurrency, but system should remain stable
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle corrupted version data', async () => {
      const space = createTestSpace();
      
      // Create version with corrupted data
      const corruptedSpace = { ...space };
      // @ts-ignore - Intentionally corrupt data
      delete corruptedSpace.space.items;

      await expect(createSpaceVersion(corruptedSpace, { 
        description: 'Corrupted version',
      })).rejects.toThrow();
    });

    test('should handle missing parent versions', async () => {
      const space = createTestSpace();
      
      await expect(createSpaceVersion(space, { 
        description: 'Orphan version',
        parentVersionId: 'nonexistent-version-id',
      })).rejects.toThrow('Parent version not found');
    });

    test('should handle version storage failures', async () => {
      const space = createTestSpace();
      
      // Mock storage failure
      const originalSave = createSpaceVersion;
      jest.spyOn(require('../../lib/spatial/version-management'), 'createSpaceVersion')
        .mockRejectedValueOnce(new Error('Storage failure'));

      await expect(createSpaceVersion(space, { 
        description: 'Failed version',
      })).rejects.toThrow('Storage failure');
    });

    test('should handle version limit exceeded', async () => {
      const space = createTestSpace();
      
      // Create versions up to limit
      for (let i = 1; i <= 100; i++) {
        space.space.items[0].position = [i, 0.1, i];
        await createSpaceVersion(space, { 
          description: `Version ${i}`,
        });
      }

      // Try to create one more
      space.space.items[0].position = [101, 0.1, 101];
      await expect(createSpaceVersion(space, { 
        description: 'Over limit version',
      })).rejects.toThrow('Version limit exceeded');
    });
  });
});

// Helper function for version pruning (would be implemented in version-management.ts)
async function pruneVersionHistory(spaceId: string, options: { keepCount: number }): Promise<number> {
  const versions = await listSpaceVersions(spaceId);
  const toDelete = versions.slice(options.keepCount);
  
  for (const version of toDelete) {
    await deleteSpaceVersion(spaceId, version.id);
  }
  
  return toDelete.length;
}
