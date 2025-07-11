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
  // Parse the markdown content more carefully
  const lines = entry.content.split('\n');
  
  // Extract the first paragraph (intro text)
  let introText = '';
  let currentSection = '';
  let yearInReviewContent = '';
  let articlesContent = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip image lines and empty lines
    if (line.startsWith('![') || line === '') continue;
    
    // Check for section headers
    if (line.includes('## The Year In Review:')) {
      currentSection = 'yearInReview';
      continue;
    } else if (line.includes('## Articles and Topics:')) {
      currentSection = 'articles';
      continue;
    }
    
    // Extract intro text (first substantial paragraph)
    if (!introText && !line.startsWith('#') && line.length > 50) {
      introText = line;
      continue;
    }
    
    // Add content to appropriate sections
    if (currentSection === 'yearInReview' && line && !line.startsWith('#')) {
      yearInReviewContent += line + '\n\n';
    } else if (currentSection === 'articles' && line && !line.startsWith('#')) {
      articlesContent += line + '\n\n';
    }
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#f5f5f5' }}>
      {/* Hero section matching blockstar.com exactly */}
      <div 
        style={{ 
          background: 'linear-gradient(135deg, #e8f5e8 0%, #d4edda 100%)',
          padding: '80px 40px',
          borderBottom: '1px solid #c3e6cb'
        }}
      >
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: '60px', alignItems: 'center' }}>
            {/* Left side - Text content */}
            <div>
              <h1 style={{ 
                fontSize: '48px', 
                fontWeight: '700', 
                color: '#2c3e50',
                lineHeight: '1.2',
                marginBottom: '24px',
                fontFamily: 'Georgia, serif'
              }}>
                Explore {entry.title} in Starholder:
              </h1>
              <p style={{ 
                fontSize: '18px', 
                color: '#495057',
                lineHeight: '1.6',
                margin: '0',
                fontFamily: 'Georgia, serif'
              }}>
                {introText}
              </p>
            </div>
            
            {/* Right side - Image */}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <img 
                src="https://www.blockstar.com/wp-content/uploads/2024/06/2079-clonedhumans.png"
                alt="2079 Cloned Humans"
                style={{ 
                  width: '100%',
                  maxWidth: '400px',
                  height: '280px',
                  objectFit: 'cover',
                  borderRadius: '8px',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.1)'
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Main content section */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '60px 40px' }}>
        
        {/* The Year In Review Section */}
        {yearInReviewContent && (
          <div style={{ marginBottom: '80px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '40px', alignItems: 'start' }}>
              {/* Left column - Header */}
              <div>
                <h2 style={{ 
                  fontSize: '24px', 
                  fontWeight: '700', 
                  color: '#2c3e50',
                  margin: '0',
                  fontFamily: 'Georgia, serif',
                  lineHeight: '1.3'
                }}>
                  The Year In<br />Review:
                </h2>
              </div>
              
              {/* Right column - Content */}
              <div style={{ 
                fontSize: '16px', 
                lineHeight: '1.7', 
                color: '#495057',
                fontFamily: 'Georgia, serif'
              }}>
                <ReactMarkdown>{yearInReviewContent.trim()}</ReactMarkdown>
              </div>
            </div>
          </div>
        )}

        {/* Articles and Topics Section */}
        {articlesContent ? (
          <div style={{ marginBottom: '60px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '40px', alignItems: 'start' }}>
              {/* Left column - Header */}
              <div>
                <h2 style={{ 
                  fontSize: '24px', 
                  fontWeight: '700', 
                  color: '#2c3e50',
                  margin: '0',
                  fontFamily: 'Georgia, serif',
                  lineHeight: '1.3'
                }}>
                  Articles and Topics:
                </h2>
              </div>
              
              {/* Right column - Content */}
              <div style={{ 
                fontSize: '16px', 
                lineHeight: '1.7', 
                color: '#495057',
                fontFamily: 'Georgia, serif'
              }}>
                <ReactMarkdown>{articlesContent.trim()}</ReactMarkdown>
              </div>
            </div>
          </div>
        ) : (
          // Show placeholder when Articles section is empty
          <div style={{ marginBottom: '60px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '40px', alignItems: 'start' }}>
              <div>
                <h2 style={{ 
                  fontSize: '24px', 
                  fontWeight: '700', 
                  color: '#2c3e50',
                  margin: '0',
                  fontFamily: 'Georgia, serif',
                  lineHeight: '1.3'
                }}>
                  Articles and Topics:
                </h2>
              </div>
              <div style={{ 
                fontSize: '16px', 
                lineHeight: '1.7', 
                color: '#6c757d',
                fontFamily: 'Georgia, serif',
                fontStyle: 'italic'
              }}>
                <p>Content for this section is being developed.</p>
              </div>
            </div>
          </div>
        )}

        {/* Fallback if no structured content found */}
        {!yearInReviewContent && !articlesContent && (
          <div style={{ 
            fontSize: '16px', 
            lineHeight: '1.7', 
            color: '#495057',
            fontFamily: 'Georgia, serif'
          }}>
            <ReactMarkdown>{entry.content}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
} 