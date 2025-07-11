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
        <article className="bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 p-8">
          <header className="mb-8">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-4">
              {entry.title}
            </h1>
            <div className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-400">
              <time dateTime={entry.date}>
                {new Date(entry.date).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </time>
              {entry.metadata?.categories && entry.metadata.categories.length > 0 && (
                <div className="flex gap-2">
                  {entry.metadata.categories.map((category: string) => (
                    <span
                      key={category}
                      className="px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded text-xs"
                    >
                      {category}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </header>

          <div className="prose prose-slate dark:prose-invert max-w-none">
            <ReactMarkdown>{entry.content}</ReactMarkdown>
          </div>
        </article>
      </div>
    </div>
  );
}

/**
 * Year-specific timeline entry component matching blockstar.com layout
 */
function YearTimelineEntry({ entry }: TimelineEntryProps) {
  // Split content to handle intro paragraph separately
  const contentLines = entry.content.split('\n');
  const introLine = contentLines.find(line => line.includes('Explore') && line.includes('Starholder'));
  const restOfContent = contentLines.filter(line => line !== introLine).join('\n');

  return (
    <div className="min-h-screen bg-white">
      {/* Main content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Intro section with green background and side-by-side layout */}
        {introLine && (
          <div className="relative bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-lg p-6 mb-8 overflow-hidden">
            <div className="flex items-start gap-6">
              <div className="flex-1 pr-56 md:pr-0">
                <p className="text-lg text-gray-700 leading-relaxed m-0">
                  {introLine}
                </p>
              </div>
            </div>
            {/* Image positioned absolutely in the top-right (hidden on mobile) */}
            <div className="absolute top-5 right-5 w-48 h-28 rounded-lg overflow-hidden shadow-lg hidden md:block">
              <img 
                src="https://www.blockstar.com/wp-content/uploads/2024/06/2079-clonedhumans.png"
                alt="2079 Cloned Humans"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        )}

        {/* Rest of the content */}
        <div className="prose prose-lg prose-gray max-w-none">
          <ReactMarkdown
            components={{
              h2: ({ children, ...props }) => (
                <h2 className="text-xl font-bold text-black mb-6 mt-8" {...props}>
                  {children}
                </h2>
              ),
              p: ({ children, ...props }) => (
                <p className="text-gray-700 leading-relaxed mb-4" {...props}>
                  {children}
                </p>
              ),
              img: () => null, // Hide images since we handle them separately
            }}
          >
            {restOfContent}
          </ReactMarkdown>
        </div>

        {/* Articles and Topics section */}
        <section className="mt-12">
          <h2 className="text-xl font-bold text-black mb-6">Articles and Topics:</h2>
          <div className="space-y-6">
            {/* This would be populated with related articles */}
            <div className="border-l-4 border-gray-200 pl-4">
              <h3 className="font-semibold text-black mb-2">
                <Link href="#" className="hover:underline">
                  Related Timeline Entry
                </Link>
              </h3>
              <p className="text-gray-700 text-sm leading-relaxed">
                {entry.title}: Exploring the key events and developments that shaped this pivotal year in the Starholder timeline...
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
} 