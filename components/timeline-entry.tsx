import Link from 'next/link';
import Image from 'next/image';
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

  return (
    <div className="max-w-4xl mx-auto px-4 pt-8 pb-12">
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
  );
}

/**
 * Year-specific timeline entry component with blockstar.com inspired layout
 */
function YearTimelineEntry({ entry }: TimelineEntryProps) {
  const yearNum = parseInt(entry.title);
  const gradientClass = getYearGradientClass(yearNum);
  
  return (
    <div className={`min-h-screen ${gradientClass}`}>
      {/* Hero Section */}
      <div className="relative overflow-hidden year-timeline-hero">
        <div className="absolute inset-0 bg-gradient-to-r from-black/20 to-transparent"></div>
        <div className="relative max-w-7xl mx-auto px-4 py-20 sm:py-32">
          <div className="text-center">
            <h1 className="text-6xl sm:text-8xl font-bold text-white mb-6 tracking-tight">
              {entry.title}
            </h1>
            <p className="text-xl sm:text-2xl text-slate-300 max-w-3xl mx-auto leading-relaxed">
              {getYearSubtitle(entry.title)}
            </p>
          </div>
        </div>
        
        {/* Decorative elements */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-10 w-2 h-2 bg-white/60 rounded-full year-timeline-star"></div>
          <div className="absolute top-40 right-20 w-1 h-1 bg-white/40 rounded-full year-timeline-star" style={{animationDelay: '1s'}}></div>
          <div className="absolute bottom-20 left-1/4 w-1.5 h-1.5 bg-white/50 rounded-full year-timeline-star" style={{animationDelay: '2s'}}></div>
          <div className="absolute top-1/3 right-1/3 w-1 h-1 bg-white/30 rounded-full year-timeline-star" style={{animationDelay: '0.5s'}}></div>
          <div className="absolute bottom-1/3 right-1/4 w-1.5 h-1.5 bg-white/45 rounded-full year-timeline-star" style={{animationDelay: '1.5s'}}></div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 pb-16">
        <div className="bg-white/10 year-timeline-backdrop rounded-2xl border border-white/20 p-8 sm:p-12 shadow-2xl">
          <div className="prose prose-lg prose-invert max-w-none year-timeline-content">
            <YearTimelineContent content={entry.content} />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Get era-specific gradient class for year entries
 */
function getYearGradientClass(year: number): string {
  if (year >= 1999 && year <= 2010) {
    return "year-gradient-1999-2010";
  } else if (year >= 2011 && year <= 2030) {
    return "year-gradient-2011-2030";
  } else if (year >= 2031 && year <= 2050) {
    return "year-gradient-2031-2050";
  } else if (year >= 2051 && year <= 2070) {
    return "year-gradient-2051-2070";
  } else if (year >= 2071 && year <= 2079) {
    return "year-gradient-2071-2079";
  }
  
  return "bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900";
}

/**
 * Get subtitle for year entries
 */
function getYearSubtitle(year: string): string {
  const yearNum = parseInt(year);
  
  if (yearNum >= 1999 && yearNum <= 2010) {
    return "The Dawn of the New Millennium";
  } else if (yearNum >= 2011 && yearNum <= 2030) {
    return "The Age of Digital Transformation";
  } else if (yearNum >= 2031 && yearNum <= 2050) {
    return "The Era of Technological Convergence";
  } else if (yearNum >= 2051 && yearNum <= 2070) {
    return "The Time of Cosmic Awakening";
  } else if (yearNum >= 2071 && yearNum <= 2079) {
    return "The Second Moon Epoch";
  }
  
  return "A Year in the Timeline";
}

/**
 * Year-specific content renderer with enhanced styling
 */
function YearTimelineContent({ content }: { content: string }) {
  // Split content into sections
  const sections = content.split(/^## /gm);
  const intro = sections[0]?.trim();
  const mainSections = sections.slice(1);

  return (
    <div className="year-timeline-content">
      {/* Introduction */}
      {intro && (
        <div className="mb-12">
          <div className="text-lg text-slate-300 leading-relaxed">
            <TimelineContent content={intro} />
          </div>
        </div>
      )}

      {/* Main Sections */}
      {mainSections.map((section, index) => {
        const lines = section.split('\n');
        const title = lines[0]?.trim();
        const content = lines.slice(1).join('\n').trim();

        return (
          <div key={index} className="mb-12">
            <h2 className="text-3xl font-bold text-white mb-6 pb-3 border-b border-white/20">
              {title}
            </h2>
            <div className="text-slate-300 leading-relaxed">
              <TimelineContent content={content} />
            </div>
          </div>
        );
      })}
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
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-blue-400 hover:text-blue-300 underline">$1</a>')
    
    // Convert images (both with and without alt text)
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="max-w-full h-auto rounded-lg shadow-lg my-6 border border-white/20" />')
    
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