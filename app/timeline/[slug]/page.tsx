import { notFound } from 'next/navigation';
import { getTimelineEntry, getAllTimelineSlugs } from '@/lib/content-reader';
import TimelineEntry from '@/components/timeline-entry';

interface TimelinePageProps {
  params: {
    slug: string;
  };
}

// Generate static params for all timeline entries
export async function generateStaticParams() {
  const slugs = await getAllTimelineSlugs();
  return slugs.map((slug) => ({
    slug: slug,
  }));
}

export default async function TimelinePage({ params }: TimelinePageProps) {
  const { slug } = params;
  
  try {
    const entry = await getTimelineEntry(slug);
    
    if (!entry) {
      notFound();
    }

    // Let the TimelineEntry component handle all layout decisions
    return <TimelineEntry entry={entry} />;
  } catch (error) {
    console.error('Error loading timeline entry:', error);
    notFound();
  }
} 