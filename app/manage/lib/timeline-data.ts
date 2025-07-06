import { getAllTimelineEntries } from '../../../lib/content-reader';

export interface TimelineEntry {
  title: string;
  slug: string;
  date: string;
  created: Date;
  modified: Date;
}

export async function getTimelineEntriesWithDates(): Promise<TimelineEntry[]> {
  const entries = await getAllTimelineEntries();
  
  return entries.map(entry => ({
    title: entry.title,
    slug: entry.slug,
    date: entry.date,
    created: new Date(entry.date), // Use date as created for now
    modified: new Date(entry.date), // Use date as modified for now
  }));
} 