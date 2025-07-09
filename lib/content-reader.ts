import fs from 'fs';
import path from 'path';
import { toSlug } from './slug-utils';

export interface TimelineEntry {
  slug: string;
  title: string;
  date: string;
  content: string;
  metadata?: Record<string, any>;
}

const TIMELINE_DIR = path.join(process.cwd(), 'content', 'timeline');

/**
 * Convert a folder name to a URL-safe slug
 */
function folderToSlug(folderName: string): string {
  return toSlug(folderName);
}

/**
 * Get all timeline entry slugs
 */
export async function getAllTimelineSlugs(): Promise<string[]> {
  try {
    const entries = fs.readdirSync(TIMELINE_DIR, { withFileTypes: true });
    
    return entries
      .filter(entry => entry.isDirectory())
      .map(entry => folderToSlug(entry.name))
      .filter(slug => slug.length > 0);
  } catch (error) {
    console.error('Error reading timeline directory:', error);
    return [];
  }
}

/**
 * Find the folder name that matches a given slug
 */
function findFolderBySlug(slug: string): string | null {
  try {
    const entries = fs.readdirSync(TIMELINE_DIR, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const entrySlug = folderToSlug(entry.name);
        if (entrySlug === slug) {
          return entry.name;
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error finding folder by slug:', error);
    return null;
  }
}

/**
 * Read a timeline entry by slug
 */
export async function getTimelineEntry(slug: string): Promise<TimelineEntry | null> {
  try {
    const folderName = findFolderBySlug(slug);
    if (!folderName) {
      return null;
    }

    const folderPath = path.join(TIMELINE_DIR, folderName);
    
    // Read the body.mdoc file
    const bodyPath = path.join(folderPath, 'body.mdoc');
    let content = '';
    
    if (fs.existsSync(bodyPath)) {
      content = fs.readFileSync(bodyPath, 'utf-8');
    } else {
      // Fallback: look for body.mdoc in a subdirectory
      const subdirs = fs.readdirSync(folderPath, { withFileTypes: true });
      for (const subdir of subdirs) {
        if (subdir.isDirectory()) {
          const subBodyPath = path.join(folderPath, subdir.name, 'body.mdoc');
          if (fs.existsSync(subBodyPath)) {
            content = fs.readFileSync(subBodyPath, 'utf-8');
            break;
          }
        }
      }
    }

    // Metadata YAML may be in slug directory (preferred) or timeline root (legacy)
    let yamlPath = path.join(folderPath, `${folderName}.yaml`);
    if (!fs.existsSync(yamlPath)) {
      yamlPath = path.join(TIMELINE_DIR, `${folderName}.yaml`);
    }
    let metadata: Record<string, any> = {};
    
    if (fs.existsSync(yamlPath)) {
      const yamlContent = fs.readFileSync(yamlPath, 'utf-8');
      try {
        const yaml = require('js-yaml');
        metadata = yaml.load(yamlContent) || {};
      } catch (e) {
        console.error('Error parsing YAML for', yamlPath, e);
      }
    }

    return {
      slug,
      title: metadata.title || folderName,
      date: metadata.date || new Date().toISOString(),
      content,
      metadata
    };
  } catch (error) {
    console.error('Error reading timeline entry:', error);
    return null;
  }
}

/**
 * Get all timeline entries
 */
export async function getAllTimelineEntries(): Promise<TimelineEntry[]> {
  const slugs = await getAllTimelineSlugs();
  const entries: TimelineEntry[] = [];
  
  for (const slug of slugs) {
    const entry = await getTimelineEntry(slug);
    if (entry) {
      entries.push(entry);
    }
  }
  
  return entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
} 