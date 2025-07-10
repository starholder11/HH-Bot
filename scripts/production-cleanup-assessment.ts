#!/usr/bin/env tsx

import fs from 'fs';
import path from 'path';

/**
 * Production Cleanup Assessment
 * 
 * This script identifies old file structure remnants that need to be removed
 * from production before deploying the new Keystatic timeline system.
 * 
 * OLD STRUCTURE (to be removed):
 * - content/timeline/{slug}.yaml (YAML files at root level)
 * - content/timeline/{slug}/body.mdoc (body.mdoc files)
 * 
 * NEW STRUCTURE (correct):
 * - content/timeline/{slug}/index.yaml (YAML in subdirectory)
 * - content/timeline/{slug}/content.mdx (content.mdx files)
 */

interface CleanupItem {
  path: string;
  type: 'old_yaml' | 'old_mdoc' | 'system_file';
  reason: string;
}

function assessProductionCleanup(): CleanupItem[] {
  const cleanupItems: CleanupItem[] = [];
  const timelineDir = path.join(process.cwd(), 'content', 'timeline');

  if (!fs.existsSync(timelineDir)) {
    console.error('❌ Timeline directory not found:', timelineDir);
    return cleanupItems;
  }

  console.log('🔍 Scanning for old file structure remnants...\n');

  // Check root level of timeline directory
  const entries = fs.readdirSync(timelineDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(timelineDir, entry.name);

    if (entry.isFile()) {
      // OLD STRUCTURE: YAML files at root level (should be in subdirectories)
      if (entry.name.endsWith('.yaml')) {
        cleanupItems.push({
          path: fullPath,
          type: 'old_yaml',
          reason: 'YAML file at root level - should be in subdirectory as index.yaml'
        });
      }

      // System files that shouldn't be in production
      if (entry.name === '.DS_Store') {
        cleanupItems.push({
          path: fullPath,
          type: 'system_file',
          reason: 'macOS system file - should not be in production'
        });
      }
    }

    if (entry.isDirectory()) {
      const subDir = path.join(timelineDir, entry.name);
      const subEntries = fs.readdirSync(subDir, { withFileTypes: true });

      for (const subEntry of subEntries) {
        const subPath = path.join(subDir, subEntry.name);

        if (subEntry.isFile()) {
          // OLD STRUCTURE: body.mdoc files (should be content.mdx)
          if (subEntry.name === 'body.mdoc') {
            cleanupItems.push({
              path: subPath,
              type: 'old_mdoc',
              reason: 'Old body.mdoc file - should be content.mdx'
            });
          }

          // System files in subdirectories
          if (subEntry.name === '.DS_Store') {
            cleanupItems.push({
              path: subPath,
              type: 'system_file',
              reason: 'macOS system file in subdirectory'
            });
          }
        }
      }
    }
  }

  return cleanupItems;
}

function generateCleanupPlan(items: CleanupItem[]): void {
  console.log('📋 PRODUCTION CLEANUP ASSESSMENT REPORT\n');
  console.log('='.repeat(50));

  if (items.length === 0) {
    console.log('✅ No old file structure remnants found!');
    console.log('   Production environment appears to be clean.');
    return;
  }

  console.log(`⚠️  Found ${items.length} items that need cleanup:\n`);

  const groupedItems = {
    old_yaml: items.filter(item => item.type === 'old_yaml'),
    old_mdoc: items.filter(item => item.type === 'old_mdoc'),
    system_file: items.filter(item => item.type === 'system_file')
  };

  // Old YAML files (critical issue)
  if (groupedItems.old_yaml.length > 0) {
    console.log('🚨 CRITICAL: Old YAML files at root level');
    console.log(`   Count: ${groupedItems.old_yaml.length} files`);
    console.log('   Impact: Will break content reader and cause 404 errors');
    console.log('   Action: DELETE these files (content has been migrated to subdirectories)\n');
    
    groupedItems.old_yaml.forEach(item => {
      console.log(`   • ${item.path}`);
    });
    console.log();
  }

  // Old MDOC files (critical issue)
  if (groupedItems.old_mdoc.length > 0) {
    console.log('🚨 CRITICAL: Old body.mdoc files');
    console.log(`   Count: ${groupedItems.old_mdoc.length} files`);
    console.log('   Impact: Will break content display and Keystatic editor');
    console.log('   Action: DELETE these files (content has been migrated to content.mdx)\n');
    
    groupedItems.old_mdoc.forEach(item => {
      console.log(`   • ${item.path}`);
    });
    console.log();
  }

  // System files (cleanup issue)
  if (groupedItems.system_file.length > 0) {
    console.log('🧹 CLEANUP: System files');
    console.log(`   Count: ${groupedItems.system_file.length} files`);
    console.log('   Impact: Clutter in repository');
    console.log('   Action: DELETE these files\n');
    
    groupedItems.system_file.forEach(item => {
      console.log(`   • ${item.path}`);
    });
    console.log();
  }

  console.log('📝 CLEANUP COMMANDS FOR PRODUCTION:');
  console.log('='.repeat(40));
  console.log('# Run these commands in production environment to clean up old files:\n');

  items.forEach(item => {
    const relativePath = path.relative(process.cwd(), item.path);
    console.log(`rm "${relativePath}"  # ${item.reason}`);
  });

  console.log('\n⚠️  IMPORTANT NOTES:');
  console.log('• Backup production before running cleanup commands');
  console.log('• Verify all timeline entries still work after cleanup');
  console.log('• These old files should NOT exist if migration was completed');
  console.log('• If they exist, they are orphaned remnants from old structure');
}

function main() {
  console.log('🚀 Starting Production Cleanup Assessment...\n');
  
  const cleanupItems = assessProductionCleanup();
  generateCleanupPlan(cleanupItems);
  
  console.log('\n✨ Assessment complete!');
  
  if (cleanupItems.length > 0) {
    console.log('\n🎯 NEXT STEPS:');
    console.log('1. Review the cleanup commands above');
    console.log('2. Test in staging environment first');
    console.log('3. Run cleanup commands in production');
    console.log('4. Verify all timeline pages work correctly');
    console.log('5. Deploy updated code that uses new file structure');
    
    process.exit(1); // Exit with error to indicate cleanup needed
  } else {
    console.log('\n🎉 Production environment is ready for deployment!');
  }
}

if (require.main === module) {
  main();
} 