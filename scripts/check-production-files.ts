#!/usr/bin/env tsx

/**
 * Check Production Repository for Old File Structure
 * 
 * This script checks the live GitHub repository to identify
 * old file structure remnants that need cleanup before deployment.
 */

import { Octokit } from '@octokit/rest';

const REPO_OWNER = 'starholder11';
const REPO_NAME = 'HH-Bot';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

interface FileInfo {
  path: string;
  type: 'old_yaml' | 'old_mdoc' | 'correct_yaml' | 'correct_mdx';
  size: number;
}

async function checkProductionFiles(): Promise<void> {
  if (!GITHUB_TOKEN) {
    console.log('⚠️  GITHUB_TOKEN not found in environment variables');
    console.log('   Set GITHUB_TOKEN to check production repository');
    console.log('   Or manually check: https://github.com/starholder11/HH-Bot/tree/main/content/timeline');
    return;
  }

  const octokit = new Octokit({ auth: GITHUB_TOKEN });

  try {
    console.log('🔍 Checking production repository for file structure...\n');

    // Get timeline directory contents
    const timelineResponse = await octokit.rest.repos.getContent({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      path: 'content/timeline',
    });

    if (!Array.isArray(timelineResponse.data)) {
      console.error('❌ Unexpected response format from GitHub API');
      return;
    }

    const files: FileInfo[] = [];
    const directories: string[] = [];

    // Process root level items
    for (const item of timelineResponse.data) {
      if (item.type === 'file' && item.name.endsWith('.yaml')) {
        // Old structure: YAML files at root level
        files.push({
          path: item.path,
          type: 'old_yaml',
          size: item.size || 0
        });
      } else if (item.type === 'dir') {
        directories.push(item.name);
      }
    }

    // Check each directory for content files
    console.log(`📁 Checking ${directories.length} timeline directories...`);
    
    let checkedDirs = 0;
    for (const dirName of directories) {
      checkedDirs++;
      if (checkedDirs % 50 === 0) {
        console.log(`   Progress: ${checkedDirs}/${directories.length} directories checked`);
      }

      try {
        const dirResponse = await octokit.rest.repos.getContent({
          owner: REPO_OWNER,
          repo: REPO_NAME,
          path: `content/timeline/${dirName}`,
        });

        if (Array.isArray(dirResponse.data)) {
          for (const file of dirResponse.data) {
            if (file.type === 'file') {
              if (file.name === 'body.mdoc') {
                // Old structure: body.mdoc files
                files.push({
                  path: file.path,
                  type: 'old_mdoc',
                  size: file.size || 0
                });
              } else if (file.name === 'index.yaml') {
                // New structure: index.yaml files
                files.push({
                  path: file.path,
                  type: 'correct_yaml',
                  size: file.size || 0
                });
              } else if (file.name === 'content.mdx') {
                // New structure: content.mdx files
                files.push({
                  path: file.path,
                  type: 'correct_mdx',
                  size: file.size || 0
                });
              }
            }
          }
        }
      } catch (error) {
        console.warn(`⚠️  Could not check directory: ${dirName}`);
      }

      // Rate limiting: small delay between requests
      if (checkedDirs % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Generate report
    generateProductionReport(files, directories.length);

  } catch (error) {
    console.error('❌ Error checking production repository:', error);
    console.log('\n💡 Manual check: Visit https://github.com/starholder11/HH-Bot/tree/main/content/timeline');
  }
}

function generateProductionReport(files: FileInfo[], totalDirs: number): void {
  console.log('\n📊 PRODUCTION REPOSITORY ANALYSIS');
  console.log('='.repeat(50));

  const filesByType = {
    old_yaml: files.filter(f => f.type === 'old_yaml'),
    old_mdoc: files.filter(f => f.type === 'old_mdoc'),
    correct_yaml: files.filter(f => f.type === 'correct_yaml'),
    correct_mdx: files.filter(f => f.type === 'correct_mdx')
  };

  console.log(`📁 Timeline directories found: ${totalDirs}`);
  console.log(`📄 Files analyzed: ${files.length}\n`);

  // Critical issues
  const criticalIssues = filesByType.old_yaml.length + filesByType.old_mdoc.length;
  
  if (criticalIssues > 0) {
    console.log('🚨 CRITICAL CLEANUP REQUIRED:\n');

    if (filesByType.old_yaml.length > 0) {
      console.log(`❌ Old YAML files at root level: ${filesByType.old_yaml.length}`);
      console.log('   These will break the content reader!');
      filesByType.old_yaml.slice(0, 5).forEach(file => {
        console.log(`   • ${file.path}`);
      });
      if (filesByType.old_yaml.length > 5) {
        console.log(`   ... and ${filesByType.old_yaml.length - 5} more`);
      }
      console.log();
    }

    if (filesByType.old_mdoc.length > 0) {
      console.log(`❌ Old body.mdoc files: ${filesByType.old_mdoc.length}`);
      console.log('   These will break Keystatic editor!');
      filesByType.old_mdoc.slice(0, 5).forEach(file => {
        console.log(`   • ${file.path}`);
      });
      if (filesByType.old_mdoc.length > 5) {
        console.log(`   ... and ${filesByType.old_mdoc.length - 5} more`);
      }
      console.log();
    }
  }

  // New structure status
  console.log('✅ NEW STRUCTURE STATUS:\n');
  console.log(`📝 index.yaml files: ${filesByType.correct_yaml.length}`);
  console.log(`📄 content.mdx files: ${filesByType.correct_mdx.length}`);

  if (filesByType.correct_yaml.length === filesByType.correct_mdx.length) {
    console.log(`✅ Structure is consistent (${filesByType.correct_yaml.length} complete entries)`);
  } else {
    console.log(`⚠️  Mismatch: ${filesByType.correct_yaml.length} YAML vs ${filesByType.correct_mdx.length} MDX`);
  }

  // Summary and recommendations
  console.log('\n📋 DEPLOYMENT RECOMMENDATIONS:\n');

  if (criticalIssues === 0) {
    console.log('🎉 PRODUCTION IS READY!');
    console.log('   • No old file structure found');
    console.log('   • All files are in new structure');
    console.log('   • Safe to deploy updated code');
  } else {
    console.log('⚠️  CLEANUP REQUIRED BEFORE DEPLOYMENT:');
    console.log('   1. Remove old YAML files at root level');
    console.log('   2. Remove old body.mdoc files');
    console.log('   3. Then deploy updated code');
    console.log('\n🔧 Cleanup commands:');
    if (filesByType.old_yaml.length > 0) {
      console.log('   git rm content/timeline/*.yaml  # Remove root-level YAML');
    }
    if (filesByType.old_mdoc.length > 0) {
      console.log('   find content/timeline -name "body.mdoc" -delete  # Remove old content files');
    }
  }

  console.log('\n🔗 Manual verification:');
  console.log(`   https://github.com/${REPO_OWNER}/${REPO_NAME}/tree/main/content/timeline`);
}

async function main() {
  console.log('🚀 Checking production repository for old file structure...\n');
  await checkProductionFiles();
}

if (require.main === module) {
  main().catch(console.error);
} 