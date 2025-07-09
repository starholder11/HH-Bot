import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import glob from 'fast-glob';

const CONTENT_ROOT = 'content/timeline';

/** Convert any string to a consistent slug format */
const toSlug = (s: string) => {
  // Split into name and extension
  const { name, ext } = path.parse(s);
  
  // Convert name to slug
  const slugName = name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')   // remove punctuation
    .replace(/\s+/g, '-')       // spaces → dash
    .replace(/-+/g, '-');       // collapse dashes
    
  // Return with extension if present
  return ext ? `${slugName}${ext}` : slugName;
};

/** Fix internal links to use slug-case */
const fixInternalLinks = (content: string) => {
  // Replace Title Case links [Link Text](Title Case) with [Link Text](slug-case)
  return content.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, link) => {
    // Skip external links (those with :// or starting with http)
    if (link.includes('://') || link.startsWith('http')) {
      return match;
    }
    
    // Convert the link part to slug-case
    const slugLink = toSlug(link);
    return `[${text}](${slugLink})`;
  });
};

/** Fix a single file's links and ensure slug-case paths */
const fixFile = async (filePath: string) => {
  try {
    // Read the file
    const content = await fs.readFile(filePath, 'utf8');
    const { data, content: body } = matter(content);
    
    // Fix links in the body
    const fixedBody = fixInternalLinks(body);
    
    // Reconstruct with fixed content
    const fixed = matter.stringify(fixedBody, data);
    
    // Get the directory and base name
    const dir = path.dirname(filePath);
    const base = path.basename(filePath);
    
    // Convert the filename to slug-case if needed
    const slugBase = toSlug(base);
    const newPath = path.join(dir, slugBase);
    
    // Write back, renaming if needed
    if (filePath !== newPath) {
      console.log(`Renaming: ${base} → ${slugBase}`);
      await fs.rename(filePath, newPath);
    }
    
    await fs.writeFile(newPath, fixed);
    console.log(`Fixed: ${newPath}`);
    
  } catch (err) {
    console.error(`Error processing ${filePath}:`, err);
  }
};

/** Main function to process all files */
const main = async () => {
  // Find all markdown and yaml files
  const files = await glob([
    `${CONTENT_ROOT}/**/*.md`,
    `${CONTENT_ROOT}/**/*.mdoc`,
    `${CONTENT_ROOT}/**/*.yaml`
  ]);
  
  console.log(`Found ${files.length} files to process`);
  
  // Process each file
  for (const file of files) {
    await fixFile(file);
  }
  
  console.log('Done!');
};

main().catch(console.error); 