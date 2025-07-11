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
    <div style={{ minHeight: '100vh', backgroundColor: '#ffffff' }}>
      {/* Hero section with proper blockstar.com green background */}
      <div 
        style={{ 
          background: '#4a7c59',  // Rich forest green matching blockstar.com
          padding: '60px 40px',
          borderBottom: '1px solid #3d5a3d'
        }}
      >
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 400px', gap: '40px', alignItems: 'center' }}>
          <div>
            <h1 style={{ 
              fontSize: '48px', 
              fontWeight: '700', 
              color: '#ffffff',
              lineHeight: '1.2',
              marginBottom: '24px',
              fontFamily: 'Georgia, serif'
            }}>
              Explore {entry.title} in Starholder:
            </h1>
            <p style={{ 
              fontSize: '18px', 
              color: '#e8f5e8',
              lineHeight: '1.6',
              margin: '0',
              fontFamily: 'Georgia, serif'
            }}>
              {introLine || 'A pivotal year in the Starholder timeline.'}
            </p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <img 
              src="https://www.blockstar.com/wp-content/uploads/2024/06/2079-clonedhumans.png"
              alt={`${entry.title} Cloned Humans`}
              style={{ 
                width: '100%', 
                maxWidth: '400px',
                height: '280px',
                objectFit: 'cover',
                borderRadius: '8px',
                border: '2px solid #ffffff'
              }}
            />
          </div>
        </div>
      </div>

      {/* Main content area */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '40px' }}>
          {/* Left sidebar with section headers */}
          <div style={{ paddingTop: '20px' }}>
            <h2 style={{ 
              fontSize: '24px', 
              fontWeight: 'bold', 
              color: '#2c3e50',
              marginBottom: '30px',
              fontFamily: 'Georgia, serif'
            }}>
              The Year In Review:
            </h2>
            
            <h2 style={{ 
              fontSize: '24px', 
              fontWeight: 'bold', 
              color: '#2c3e50',
              marginBottom: '30px',
              fontFamily: 'Georgia, serif'
            }}>
              Articles and Topics:
            </h2>
          </div>

          {/* Right content area */}
          <div style={{ paddingTop: '20px' }}>
            {/* Year in Review content */}
            <div style={{ marginBottom: '60px' }}>
              <div style={{ 
                fontSize: '16px', 
                color: '#495057',
                lineHeight: '1.8',
                fontFamily: 'Georgia, serif'
              }}>
                {yearInReviewContent ? (
                  <ReactMarkdown>{yearInReviewContent}</ReactMarkdown>
                ) : (
                  <p>The comprehensive review for {entry.title} chronicles the significant events and developments that shaped this pivotal year in the Starholder timeline.</p>
                )}
              </div>
            </div>

            {/* Articles and Topics content */}
            <div>
              <div style={{ 
                fontSize: '16px', 
                color: '#495057',
                lineHeight: '1.8',
                fontFamily: 'Georgia, serif'
              }}>
                {articlesContent ? (
                  <ReactMarkdown>{articlesContent}</ReactMarkdown>
                ) : (
                  <p>Content for this section is being developed. Check back soon for detailed articles and topics related to {entry.title}.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 