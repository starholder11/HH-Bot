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

    // Check if this is a year entry (1999-2079) - if so, let the component handle full layout
    const isYearEntry = /^(19|20)\d{2}$/.test(entry.title) && 
                        parseInt(entry.title) >= 1999 && 
                        parseInt(entry.title) <= 2079;

    if (isYearEntry) {
      return <TimelineEntry entry={entry} />;
    }

    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <TimelineEntry entry={entry} />
        </div>
      </div>
    );
  } catch (error) {
    console.error('Error loading timeline entry:', error);
    notFound();
  }
} 