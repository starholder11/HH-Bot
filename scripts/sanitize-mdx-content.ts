import fs from 'fs';
import path from 'path';

// Comprehensive MDX sanitization rules
function sanitizeMdxContent(content: string): string {
  let sanitized = content;

  // 1. Remove HTML anchor tags completely
  sanitized = sanitized.replace(/<a\s+id\s*=\s*[\"'][^\"']*[\"']\s*><\/a>/g, '');

  // 2. Remove empty anchor tags
  sanitized = sanitized.replace(/<a\s+id\s*=\s*[\"'][\"']\s*><\/a>/g, '');

  // 3. Convert custom tags to markdown emphasis/italics
  // <hyperreal> -> *hyperreal*
  sanitized = sanitized.replace(/<hyperreal>/g, '*hyperreal*');
  
  // <genesis> -> *genesis*
  sanitized = sanitized.replace(/<genesis>/g, '*genesis*');
  
  // <moonshot> -> *moonshot*
  sanitized = sanitized.replace(/<moonshot>/g, '*moonshot*');
  
  // <vantium> -> *vantium*
  sanitized = sanitized.replace(/<vantium>/g, '*vantium*');
  
  // <automata> -> *automata*
  sanitized = sanitized.replace(/<automata>/g, '*automata*');
  
  // <rooftop> -> *rooftop*
  sanitized = sanitized.replace(/<rooftop>/g, '*rooftop*');

  // 4. Convert heading IDs to plain headings (remove {#id} syntax)
  sanitized = sanitized.replace(/^(#{1,6})\s*(.+?)\s*\{#[^}]+\}\s*$/gm, '$1 $2');

  // 5. Remove WordPress catlist shortcodes
  sanitized = sanitized.replace(/\[catlist[^\]]*\]/g, '');

  // 6. Clean up any remaining standalone HTML tags (convert to emphasis)
  sanitized = sanitized.replace(/<([a-zA-Z-]+)>/g, '*$1*');

  // 7. Remove any HTML-style URLs that might be problematic
  sanitized = sanitized.replace(/<https?:\/\/[^>]+>/g, (match) => {
    // Extract the URL and convert to markdown link format
    const url = match.slice(1, -1); // Remove < and >
    return `[${url}](${url})`;
  });

  // 8. Clean up multiple consecutive newlines (keep max 2)
  sanitized = sanitized.replace(/\n{3,}/g, '\n\n');

  // 9. Remove any trailing whitespace from lines
  sanitized = sanitized.replace(/[ \t]+$/gm, '');

  // 10. Remove non-breaking spaces and other problematic Unicode characters
  sanitized = sanitized.replace(/&nbsp;/g, ' ');
  sanitized = sanitized.replace(/\u00A0/g, ' '); // Non-breaking space
  sanitized = sanitized.replace(/\u200B/g, ''); // Zero-width space
  sanitized = sanitized.replace(/\u2060/g, ''); // Word joiner

  return sanitized;
}

// Function to process a single MDX file
function processFile(filePath: string): boolean {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const originalContent = content;
    
    // Apply sanitization
    const sanitizedContent = sanitizeMdxContent(content);
    
    // Only write if content changed
    if (sanitizedContent !== originalContent) {
      fs.writeFileSync(filePath, sanitizedContent, 'utf-8');
      console.log(`✅ Sanitized: ${path.relative('content/timeline', filePath)}`);
      return true;
    } else {
      console.log(`⏭️  No changes: ${path.relative('content/timeline', filePath)}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error);
    return false;
  }
}

// Main function to process all timeline MDX files
function main() {
  const timelineDir = path.join(process.cwd(), 'content', 'timeline');
  
  if (!fs.existsSync(timelineDir)) {
    console.error('❌ Timeline directory not found:', timelineDir);
    process.exit(1);
  }

  console.log('🧹 Starting comprehensive MDX content sanitization...\n');

  let processedCount = 0;
  let changedCount = 0;
  let errorCount = 0;

  // Get all subdirectories in timeline
  const entries = fs.readdirSync(timelineDir, { withFileTypes: true });
  const directories = entries.filter(entry => entry.isDirectory());

  for (const dir of directories) {
    const mdxPath = path.join(timelineDir, dir.name, 'content.mdx');
    
    if (fs.existsSync(mdxPath)) {
      processedCount++;
      const changed = processFile(mdxPath);
      if (changed) changedCount++;
    } else {
      console.log(`⚠️  Missing content.mdx: ${dir.name}`);
    }
  }

  console.log(`\n📊 Sanitization Summary:`);
  console.log(`   Total files processed: ${processedCount}`);
  console.log(`   Files changed: ${changedCount}`);
  console.log(`   Files unchanged: ${processedCount - changedCount}`);
  console.log(`   Errors: ${errorCount}`);
  console.log(`\n✨ MDX content sanitization complete!`);
}

// Run the script
main(); 