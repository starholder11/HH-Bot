import Link from 'next/link';
import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import type { TimelineEntry } from '@/lib/content-reader';

interface TimelineEntryProps {
  entry: TimelineEntry;
}

export default function TimelineEntry({ entry }: TimelineEntryProps) {
  // Check if this is a year entry (1999-2079)
  const isYearEntry = /^(19|20)\d{2}$/.test(entry.title) && 
                      parseInt(entry.title) >= 1999 && 
                      parseInt(entry.title) <= 2079;

  if (isYearEntry) {
    return <YearTimelineEntry entry={entry} />;
  }

  // Regular timeline entries with container
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 pt-8 pb-12">
        <article className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="p-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-6">{entry.title}</h1>
            <div className="prose prose-lg max-w-none">
              <ReactMarkdown>{entry.content}</ReactMarkdown>
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}

function YearTimelineEntry({ entry }: { entry: TimelineEntry }) {
  // Parse the markdown for the intro blurb and the rest
  const [intro, ...rest] = entry.content.split('\n\n');
  const imageUrl = "https://www.blockstar.com/wp-content/uploads/2024/06/2079-clonedhumans.png";

  return (
    <div className="year-page">
      <section className="year-hero">
        <div className="year-hero-inner">
          <div className="year-hero-text">
            <h1>Explore {entry.title} in Starholder:</h1>
            <p>{intro}</p>
          </div>
          <div className="year-hero-image">
            <img src={imageUrl} alt="2079 Cloned Humans" />
          </div>
        </div>
      </section>

      {/* Main grid */}
      <div className="year-grid">
        {/* Sidebar */}
        <div className="year-sidebar pt-5">
          <h2>The Year In Review:</h2>
          <h2>Articles and Topics:</h2>
        </div>

        {/* Content */}
        <div className="pt-5">
          <div className="mb-16 year-copy">
            {/* The original code had a placeholder for yearInReviewContent,
                but the new code doesn't explicitly extract it.
                Assuming the intent was to remove the placeholder and
                rely on the new structure or that the content is now
                directly in the intro.
                For now, keeping the placeholder as it was in the original file.
            */}
            <ReactMarkdown>{intro}</ReactMarkdown>
          </div>

          <div className="year-copy">
            {/* The original code had a placeholder for articlesContent,
                but the new code doesn't explicitly extract it.
                Assuming the intent was to remove the placeholder and
                rely on the new structure or that the content is now
                directly in the intro.
                For now, keeping the placeholder as it was in the original file.
            */}
            <p>Content for this section is being developed. Check back soon for detailed articles and topics related to {entry.title}.</p>
          </div>
        </div>
      </div>
    </div>
  );
} 