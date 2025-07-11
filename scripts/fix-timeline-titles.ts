#!/usr/bin/env tsx

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

/**
 * Fix Timeline Titles Script
 * 
 * Converts all timeline entry titles from slug format (e.g., "above-the-clouds")
 * to proper titles (e.g., "Above The Clouds") while preserving directory structure
 * and URL slugs.
 */

interface TimelineEntry {
  title: string;
  date: string;
  categories?: string[];
  [key: string]: any;
}

function slugToTitle(slug: string): string {
  return slug
    .split('-')
    .map(word => {
      // Handle special cases and acronyms
      const specialCases: { [key: string]: string } = {
        'ai': 'AI',
        'vip': 'VIP',
        'gdp': 'GDP',
        'us': 'US',
        'usa': 'USA',
        'uk': 'UK',
        'ceo': 'CEO',
        'cto': 'CTO',
        'cfo': 'CFO',
        'api': 'API',
        'ui': 'UI',
        'ux': 'UX',
        'ios': 'iOS',
        'tv': 'TV',
        'pc': 'PC',
        'mac': 'Mac',
        'id': 'ID',
        'url': 'URL',
        'html': 'HTML',
        'css': 'CSS',
        'js': 'JS',
        'json': 'JSON',
        'xml': 'XML',
        'sql': 'SQL',
        'db': 'DB',
        'nasa': 'NASA',
        'fbi': 'FBI',
        'cia': 'CIA',
        'nsa': 'NSA',
        'dna': 'DNA',
        'rna': 'RNA',
        'phd': 'PhD',
        'md': 'MD',
        'ba': 'BA',
        'ma': 'MA',
        'llc': 'LLC',
        'inc': 'Inc',
        'corp': 'Corp',
        'ltd': 'Ltd',
        'co': 'Co',
        'vs': 'vs',
        'and': 'and',
        'or': 'or',
        'the': 'the',
        'of': 'of',
        'in': 'in',
        'on': 'on',
        'at': 'at',
        'to': 'to',
        'for': 'for',
        'with': 'with',
        'by': 'by',
        'from': 'from',
        'an': 'an',
        'a': 'a',
        'is': 'is',
        'was': 'was',
        'are': 'are',
        'were': 'were',
        'be': 'be',
        'been': 'been',
        'being': 'being',
        'have': 'have',
        'has': 'has',
        'had': 'had',
        'do': 'do',
        'does': 'does',
        'did': 'did',
        'will': 'will',
        'would': 'would',
        'could': 'could',
        'should': 'should',
        'may': 'may',
        'might': 'might',
        'must': 'must',
        'can': 'can'
      };

      const lowerWord = word.toLowerCase();
      
      // Check if it's a special case
      if (specialCases[lowerWord]) {
        return specialCases[lowerWord];
      }
      
      // Handle numbers (years, etc.)
      if (/^\d+$/.test(word)) {
        return word;
      }
      
      // Handle Roman numerals
      if (/^[ivxlcdm]+$/i.test(word)) {
        return word.toUpperCase();
      }
      
      // Default: capitalize first letter
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ')
    .trim();
}

function fixTitleCapitalization(title: string): string {
  // Split into words and handle capitalization rules
  const words = title.split(' ');
  
  return words.map((word, index) => {
    const lowerWord = word.toLowerCase();
    
    // Always capitalize first and last word
    if (index === 0 || index === words.length - 1) {
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }
    
    // Keep certain words lowercase unless they're first/last
    const lowercaseWords = ['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'nor', 'of', 'on', 'or', 'so', 'the', 'to', 'up', 'yet'];
    
    if (lowercaseWords.includes(lowerWord)) {
      return lowerWord;
    }
    
    // Default: capitalize first letter
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join(' ');
}

function updateTimelineEntry(entryPath: string): boolean {
  try {
    const yamlPath = path.join(entryPath, 'index.yaml');
    
    if (!fs.existsSync(yamlPath)) {
      console.log(`⚠️  Skipping ${entryPath} - no index.yaml found`);
      return false;
    }
    
    const yamlContent = fs.readFileSync(yamlPath, 'utf8');
    const data = yaml.load(yamlContent) as TimelineEntry;
    
    if (!data || !data.title) {
      console.log(`⚠️  Skipping ${entryPath} - no title found`);
      return false;
    }
    
    const originalTitle = data.title;
    
    // Check if title looks like a slug (contains hyphens, all lowercase, etc.)
    const isSlugFormat = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(originalTitle);
    
    if (!isSlugFormat) {
      console.log(`✅ Skipping ${path.basename(entryPath)} - title already formatted: "${originalTitle}"`);
      return false;
    }
    
    // Convert slug to proper title
    const newTitle = fixTitleCapitalization(slugToTitle(originalTitle));
    
    if (newTitle === originalTitle) {
      console.log(`✅ Skipping ${path.basename(entryPath)} - no change needed`);
      return false;
    }
    
    // Update the title
    data.title = newTitle;
    
    // Write back to file
    const updatedYaml = yaml.dump(data, {
      indent: 2,
      lineWidth: -1,
      quotingType: '"',
      forceQuotes: false
    });
    
    fs.writeFileSync(yamlPath, updatedYaml, 'utf8');
    
    console.log(`✅ Updated ${path.basename(entryPath)}: "${originalTitle}" → "${newTitle}"`);
    return true;
    
  } catch (error) {
    console.error(`❌ Error processing ${entryPath}:`, error);
    return false;
  }
}

function main() {
  const timelineDir = 'content/timeline';
  
  if (!fs.existsSync(timelineDir)) {
    console.error('❌ Timeline directory not found:', timelineDir);
    process.exit(1);
  }
  
  console.log('🔧 Starting timeline title fixes...\n');
  
  const entries = fs.readdirSync(timelineDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name)
    .sort();
  
  console.log(`Found ${entries.length} timeline entries to process\n`);
  
  let updatedCount = 0;
  let skippedCount = 0;
  
  for (const entryName of entries) {
    const entryPath = path.join(timelineDir, entryName);
    const wasUpdated = updateTimelineEntry(entryPath);
    
    if (wasUpdated) {
      updatedCount++;
    } else {
      skippedCount++;
    }
  }
  
  console.log('\n📊 Summary:');
  console.log(`✅ Updated: ${updatedCount} entries`);
  console.log(`⏭️  Skipped: ${skippedCount} entries`);
  console.log(`📝 Total: ${entries.length} entries processed`);
  
  if (updatedCount > 0) {
    console.log('\n🎉 Title fixes completed successfully!');
    console.log('💡 Next steps:');
    console.log('   1. Review the changes with: git diff');
    console.log('   2. Commit the changes: git add . && git commit -m "Fix timeline titles"');
    console.log('   3. Push to production: git push origin main');
  } else {
    console.log('\n✨ All titles are already properly formatted!');
  }
}

if (require.main === module) {
  main();
} 