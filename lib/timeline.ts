import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

export interface TimelineEntry {
  title: string;
  slug: string;
  date: string;
  body: string;
  filename: string;
}

export function getTimelineEntries(): TimelineEntry[] {
  const timelineDirectory = path.join(process.cwd(), 'content/timeline');
  
  // Check if directory exists
  if (!fs.existsSync(timelineDirectory)) {
    return [];
  }

  const filenames = fs.readdirSync(timelineDirectory);
  const timelineEntries = filenames
    .filter((filename: string) => filename.endsWith('.md'))
    .map((filename: string) => {
      const filePath = path.join(timelineDirectory, filename);
      const fileContents = fs.readFileSync(filePath, 'utf8');
      const { data, content } = matter(fileContents);
      
      return {
        title: data.title,
        slug: data.slug,
        date: data.date,
        body: content,
        filename: filename.replace('.md', ''),
      };
    })
    .sort((a: TimelineEntry, b: TimelineEntry) => new Date(b.date).getTime() - new Date(a.date).getTime()); // Sort by date, newest first

  return timelineEntries;
}

export function getTimelineEntry(slug: string): TimelineEntry | null {
  const timelineEntries = getTimelineEntries();
  return timelineEntries.find(entry => entry.slug === slug) || null;
} 