import Link from 'next/link';
import Image from 'next/image';
import type { TimelineEntry } from '@/lib/content-reader';

interface TimelineEntryProps {
  entry: TimelineEntry;
}

export default function TimelineEntry({ entry }: TimelineEntryProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <Link 
              href="/" 
              className="inline-flex items-center text-blue-500 hover:text-blue-600 transition-colors"
            >
              ← Back to Timeline
            </Link>
          </div>
          
          <article className="bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 p-8">
            <header className="mb-6">
              <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-200 mb-2">
                {entry.title}
              </h1>
              <time className="text-slate-500 dark:text-slate-400">
                {new Date(entry.date).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </time>
            </header>
            
            <div className="prose prose-lg dark:prose-invert max-w-none">
              <TimelineContent content={entry.content} />
            </div>
          </article>
        </div>
      </div>
    </div>
  );
}

/**
 * Component to render timeline content with proper markdown and image handling
 */
function TimelineContent({ content }: { content: string }) {
  // Simple markdown-like processing for basic formatting
  const processedContent = content
    // Convert markdown headers
    .replace(/^### (.*$)/gim, '<h3 class="text-xl font-semibold mt-6 mb-3">$1</h3>')
    .replace(/^## (.*$)/gim, '<h2 class="text-2xl font-semibold mt-8 mb-4">$1</h2>')
    .replace(/^# (.*$)/gim, '<h1 class="text-3xl font-bold mt-8 mb-4">$1</h1>')
    
    // Convert bold and italic
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    
    // Convert links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-blue-500 hover:text-blue-600 underline">$1</a>')
    
    // Convert line breaks to paragraphs
    .split('\n\n')
    .map(paragraph => {
      if (paragraph.trim()) {
        return `<p class="mb-4 leading-relaxed">${paragraph.trim()}</p>`;
      }
      return '';
    })
    .join('');

  return (
    <div 
      className="timeline-content"
      dangerouslySetInnerHTML={{ __html: processedContent }}
    />
  );
} 