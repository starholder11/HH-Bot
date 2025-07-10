import fs from 'fs';
import path from 'path';

// Function to remove HTML anchor tags while preserving markdown headings
function removeHtmlAnchors(content: string): string {
  // Remove all HTML anchor tags like <a id="..."></a>
  return content.replace(/<a\s+id\s*=\s*["'][^"']*["']\s*><\/a>/g, '');
}

// Function to process a single MDX file
function processFile(filePath: string): boolean {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const originalContent = content;
    
    // Check if file contains HTML anchor tags
    const hasHtmlAnchors = /<a\s+id\s*=\s*["'][^"']*["']\s*><\/a>/.test(content);
    
    if (hasHtmlAnchors) {
      const cleanedContent = removeHtmlAnchors(content);
      fs.writeFileSync(filePath, cleanedContent, 'utf-8');
      console.log(`✅ Removed HTML anchors from: ${filePath}`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error);
    return false;
  }
}

// Function to scan and process all MDX files
function processAllMdxFiles() {
  const timelineDir = 'content/timeline';
  let processedCount = 0;
  let totalFiles = 0;

  try {
    const entries = fs.readdirSync(timelineDir);
    
    for (const entry of entries) {
      const entryPath = path.join(timelineDir, entry);
      
      if (fs.statSync(entryPath).isDirectory()) {
        const contentFile = path.join(entryPath, 'content.mdx');
        
        if (fs.existsSync(contentFile)) {
          totalFiles++;
          if (processFile(contentFile)) {
            processedCount++;
          }
        }
      }
    }
    
    console.log(`\n📊 Summary:`);
    console.log(`   Total MDX files scanned: ${totalFiles}`);
    console.log(`   Files with HTML anchors removed: ${processedCount}`);
    console.log(`   Files unchanged: ${totalFiles - processedCount}`);
    
  } catch (error) {
    console.error('❌ Error scanning timeline directory:', error);
  }
}

// Main execution
console.log('🧹 Starting HTML anchor removal process...\n');
processAllMdxFiles();
console.log('\n✨ Process completed!'); 