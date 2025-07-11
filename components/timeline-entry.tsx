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
        <article className="bg-white rounded-lg shadow-sm p-8">
          <header className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">{entry.title}</h1>
            {entry.date && (
              <time className="text-sm text-gray-500 font-medium">
                {new Date(entry.date).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </time>
            )}
          </header>
          
          <div className="prose prose-lg max-w-none">
            <ReactMarkdown>{entry.content}</ReactMarkdown>
          </div>
        </article>
      </div>
    </div>
  );
}

function YearTimelineEntry({ entry }: { entry: TimelineEntry }) {
  // Extract the first paragraph as intro text
  const lines = entry.content.split('\n').filter(line => line.trim());
  const introLine = lines.find(line => 
    line.trim() && 
    !line.startsWith('#') && 
    !line.startsWith('*') && 
    !line.startsWith('-') &&
    line.length > 50
  );

  // Extract sections after the intro
  const contentLines = entry.content.split('\n');
  let yearInReviewContent = '';
  let articlesContent = '';
  let currentSection = '';
  
  for (let i = 0; i < contentLines.length; i++) {
    const line = contentLines[i];
    
    if (line.includes('## The Year In Review:')) {
      currentSection = 'yearInReview';
      continue;
    } else if (line.includes('## Articles and Topics:')) {
      currentSection = 'articles';
      continue;
    }
    
    if (currentSection === 'yearInReview' && line.trim() && !line.startsWith('#')) {
      yearInReviewContent += line + '\n';
    } else if (currentSection === 'articles' && line.trim() && !line.startsWith('#')) {
      articlesContent += line + '\n';
    }
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Large top hero section matching blockstar.com */}
      {introLine && (
        <div className="bg-gradient-to-r from-green-50 to-green-100 border-b border-green-200 py-16 px-8">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div>
                <h1 className="text-4xl lg:text-5xl font-bold text-gray-900 mb-6 leading-tight">
                  Explore {entry.title} in Starholder:
                </h1>
                <p className="text-lg lg:text-xl text-gray-700 leading-relaxed">
                  {introLine}
                </p>
              </div>
              <div className="flex justify-center lg:justify-end">
                <img 
                  src="https://www.blockstar.com/wp-content/uploads/2024/06/2079-clonedhumans.png"
                  alt="2079 Cloned Humans"
                  className="w-full max-w-lg h-80 object-cover rounded-lg shadow-lg"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main content with two-column layout */}
      <div className="max-w-6xl mx-auto px-8 py-16">
        {/* Year In Review Section */}
        {yearInReviewContent && (
          <div className="mb-16">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
              <div className="lg:col-span-1">
                <h2 className="text-2xl font-bold text-gray-900 mb-4 lg:mb-0">
                  The Year In Review:
                </h2>
              </div>
              <div className="lg:col-span-3">
                <div className="prose prose-lg max-w-none text-gray-700">
                  <ReactMarkdown>{yearInReviewContent.trim()}</ReactMarkdown>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Articles and Topics Section */}
        {articlesContent && (
          <div className="mb-16">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
              <div className="lg:col-span-1">
                <h2 className="text-2xl font-bold text-gray-900 mb-4 lg:mb-0">
                  Articles and Topics:
                </h2>
              </div>
              <div className="lg:col-span-3">
                <div className="prose prose-lg max-w-none text-gray-700">
                  <ReactMarkdown>{articlesContent.trim()}</ReactMarkdown>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Fallback if no structured content */}
        {!yearInReviewContent && !articlesContent && (
          <div className="prose prose-lg max-w-none text-gray-700">
            <ReactMarkdown>{entry.content}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
} 