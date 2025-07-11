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
  // Parse the content to extract intro and sections
  const lines = entry.content.split('\n').filter(line => line.trim());
  
  // Find the intro paragraph (first substantial paragraph)
  const introLine = lines.find(line => 
    line.trim().length > 50 && 
    !line.startsWith('#') && 
    !line.startsWith('##') &&
    !line.includes('Year In Review') &&
    !line.includes('Articles and Topics')
  );

  // Find "The Year In Review:" section
  const yearInReviewIndex = lines.findIndex(line => 
    line.includes('Year In Review') || line.includes('THE YEAR IN REVIEW')
  );
  
  // Find "Articles and Topics:" section
  const articlesIndex = lines.findIndex(line => 
    line.includes('Articles and Topics') || line.includes('ARTICLES AND TOPICS')
  );

  // Extract content for each section
  const yearInReviewContent = yearInReviewIndex !== -1 ? 
    lines.slice(yearInReviewIndex + 1, articlesIndex !== -1 ? articlesIndex : undefined)
         .filter(line => line.trim() && !line.startsWith('#'))
         .join('\n\n') : '';

  const articlesContent = articlesIndex !== -1 ? 
    lines.slice(articlesIndex + 1)
         .filter(line => line.trim() && !line.startsWith('#'))
         .join('\n\n') : '';

  return (
    <div className="year-page min-h-screen">
      {/* Hero */}
      <div className="year-hero">
        <div className="max-w-[1200px] mx-auto grid lg:grid-cols-[1fr_400px] gap-10 items-center">
          <div>
            <h1>Explore {entry.title} in Starholder:</h1>
            <p>{introLine || 'A pivotal year in the Starholder timeline.'}</p>
          </div>
          <div className="text-center">
            <img
              src="https://www.blockstar.com/wp-content/uploads/2024/06/2079-clonedhumans.png"
              alt={`${entry.title} Cloned Humans`}
              className="w-full max-w-[400px] h-[280px] object-cover rounded-md border-2 border-white mx-auto"
            />
          </div>
        </div>
      </div>

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
            {yearInReviewContent ? (
              <ReactMarkdown>{yearInReviewContent}</ReactMarkdown>
            ) : (
              <p>The comprehensive review for {entry.title} chronicles the significant events and developments that shaped this pivotal year in the Starholder timeline.</p>
            )}
          </div>

          <div className="year-copy">
            {articlesContent ? (
              <ReactMarkdown>{articlesContent}</ReactMarkdown>
            ) : (
              <p>Content for this section is being developed. Check back soon for detailed articles and topics related to {entry.title}.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 