import fs from 'fs';
import path from 'path';

// Function to convert HTML anchors to markdown heading IDs
function convertHtmlAnchorsToMarkdown(content: string): string {
  // Pattern to find HTML anchor tags followed by headings
  // e.g., <a id="some-id"></a>\n## Heading
  const pattern = /<a\s+id\s*=\s*["']([^"']+)["']\s*><\/a>\s*\n(#{1,6})\s*(.+)/g;
  
  return content.replace(pattern, (match, id, hashes, headingText) => {
    // Convert to markdown heading with ID
    return `${hashes} ${headingText} {#${id}}`;
  });
}

// Function to process a single MDX file
function processFile(filePath: string): boolean {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const originalContent = content;
    
    // Check if file contains HTML anchor tags before headings
    const hasHtmlAnchors = /<a\s+id\s*=\s*["'][^"']*["']\s*><\/a>\s*\n#{1,6}/.test(content);
    
    if (hasHtmlAnchors) {
      const convertedContent = convertHtmlAnchorsToMarkdown(content);
      fs.writeFileSync(filePath, convertedContent, 'utf-8');
      console.log(`✅ Converted: ${filePath}`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error);
    return false;
  }
}

// Function to recursively find all MDX files
function findMdxFiles(dir: string): string[] {
  const files: string[] = [];
  
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        files.push(...findMdxFiles(fullPath));
      } else if (entry.isFile() && (entry.name.endsWith('.mdx') || entry.name.endsWith('.mdoc'))) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dir}:`, error);
  }
  
  return files;
}

// Main execution
function main() {
  const contentDir = 'content/timeline';
  console.log('🔍 Converting HTML anchors to Markdown heading IDs...');
  
  if (!fs.existsSync(contentDir)) {
    console.error(`❌ Content directory not found: ${contentDir}`);
    process.exit(1);
  }
  
  const mdxFiles = findMdxFiles(contentDir);
  console.log(`📁 Found ${mdxFiles.length} MDX files`);
  
  let processedCount = 0;
  
  for (const file of mdxFiles) {
    if (processFile(file)) {
      processedCount++;
    }
  }
  
  console.log(`\n✨ Conversion complete!`);
  console.log(`📊 Summary: ${processedCount} files converted, ${mdxFiles.length - processedCount} files unchanged`);
  
  if (processedCount > 0) {
    console.log('\n💡 HTML anchor tags have been converted to Markdown heading IDs.');
    console.log('   This preserves the same anchor link functionality while being compatible with Keystatic MDX.');
    console.log('   Example: <a id="section"></a>\\n## Title -> ## Title {#section}');
  }
}

main(); 