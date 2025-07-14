import ReactMarkdown from 'react-markdown';
import type { TimelineEntry } from '@/lib/content-reader';
import YearReviewTemplate from './templates/YearReviewTemplate';

interface TimelineEntryProps {
  entry: TimelineEntry;
}

export default function TimelineEntry({ entry }: TimelineEntryProps) {
  // Check if this entry should use a template
  const template = entry.metadata?.template;

  // Use YearReviewTemplate if specified
  if (template === 'year-review') {
    return <YearReviewTemplate entry={entry} />;
  }

  // Default rendering for entries without templates
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
