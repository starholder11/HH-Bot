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
  return (
    <div className="min-h-screen bg-white">
      {/* Header matching blockstar.com */}
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-black">
              Starholder
            </h1>
            <div className="flex items-center gap-4">
              <div className="text-sm text-gray-600">Search</div>
              <div className="text-sm text-gray-600">Menu</div>
              <div className="text-sm text-gray-600">About</div>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Introductory paragraph */}
        <div className="mb-8">
          <p className="text-lg text-gray-700 leading-relaxed">
            In {entry.title}, explore the Starholder timeline where personal struggles with imposter syndrome and societal tensions from omnipotent surveillance paint a year of introspection and revolt against digital dominance.
          </p>
        </div>

        {/* The Year In Review section */}
        <section className="mb-12">
          <h2 className="text-xl font-bold text-black mb-6">The Year In Review:</h2>
          <div className="prose prose-lg prose-gray max-w-none">
            <div className="text-gray-700 leading-relaxed space-y-4">
              <ReactMarkdown>{entry.content}</ReactMarkdown>
            </div>
          </div>
        </section>

        {/* Articles and Topics section */}
        <section>
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