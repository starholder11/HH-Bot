import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import glob from 'fast-glob';
import yaml from 'js-yaml';

console.log('Starting import script...');

/* CHANGE THESE ONLY IF YOUR LAYOUT MOVES */
const IMPORT_ROOT = 'import_src';           // unzip export here
const DEST_ROOT   = 'content/timeline';     // repo destination

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

/** Clean up legacy URLs and links */
const cleanContent = (content: string) => {
  return content
    // Convert blockstar.com links to internal
    .replace(/https?:\/\/(?:www\.)?blockstar\.com\/timeline\/([^)\s]+)/g, (_, slug) => toSlug(slug))
    
    // Convert internal links to slug-case
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, link) => {
      if (link.includes('://') || link.startsWith('http')) return match;
      return `[${text}](${toSlug(link)})`;
    })
    
    // Clean up any remaining bare URLs
    .replace(/https?:\/\/(?:www\.)?blockstar\.com\/timeline\/([^\s)]+)/g, (_, slug) => toSlug(slug));
};

/** Process a single timeline entry */
const processEntry = async (srcPath: string) => {
  try {
    const entrySlug = toSlug(path.basename(srcPath));
    
    // Read source files - the YAML file is named after the slug
    const yamlPath = path.join(srcPath, `${path.basename(srcPath)}.yaml`);
    const mdocPath = path.join(srcPath, 'body.mdoc');
    
    const [yamlContent, mdocContent] = await Promise.all([
      fs.readFile(yamlPath, 'utf8').catch(() => null),
      fs.readFile(mdocPath, 'utf8').catch(() => null)
    ]);
    
    if (!yamlContent || !mdocContent) {
      console.warn(`Missing files for ${srcPath}, skipping`);
      return;
    }
    
    // Parse YAML content directly (not as front matter)
    const yamlData = yaml.load(yamlContent) as any;
    
    // Clean up the YAML data
    if (yamlData.wordpress_id) delete yamlData.wordpress_id;
    if (yamlData.status) delete yamlData.status;
    
    // Ensure slug field is present
    yamlData.slug = entrySlug;
    
    // Normalize date format
    if (yamlData.date && typeof yamlData.date === 'string') {
      yamlData.date = yamlData.date.split(' ')[0]; // Keep only YYYY-MM-DD part
    }
    
    // Clean up the content
    const cleanedContent = cleanContent(mdocContent);
    
    // Create destination directory
    const destDir = path.join(DEST_ROOT, entrySlug);
    await fs.mkdir(destDir, { recursive: true });
    
    // Write the files
    await Promise.all([
      fs.writeFile(
        path.join(destDir, `${entrySlug}.yaml`),
        matter.stringify('', yamlData)
      ),
      fs.writeFile(
        path.join(destDir, 'body.mdoc'),
        cleanedContent
      )
    ]);
    
    console.log(`✓ Imported: ${entrySlug}`);
    
  } catch (err) {
    console.error(`Error processing ${srcPath}:`, err);
  }
};

/** Main import function */
const main = async () => {
  // Find all timeline entries (directories with body.yaml and body.mdoc)
  const entries = await glob(`${IMPORT_ROOT}/content/timeline/*/`, {
    onlyDirectories: true
  });
  
  console.log(`Found ${entries.length} entries to import`);
  
  // Process each entry
  for (const entry of entries) {
    await processEntry(entry);
  }
  
  console.log('Import complete!');
};

main().catch(console.error); 