import React from 'react';
import ReactMarkdown from 'react-markdown';
import type { TimelineEntry } from '@/lib/content-reader';
import { getTimelineEntriesByYear } from '@/lib/content-reader';

interface YearReviewTemplateProps {
  entry: TimelineEntry;
}

// Helper function to extract first sentence from content
function getFirstSentence(content: string): string {
  // Remove markdown formatting and get first sentence
  const cleanContent = content
    .replace(/^#+\s+/gm, '') // Remove headers
    .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove links
    .replace(/\n+/g, ' ') // Replace newlines with spaces
    .trim();

  // Find the first sentence (ends with . ! or ?)
  const sentenceMatch = cleanContent.match(/[^.!?]*[.!?]/);
  return sentenceMatch ? sentenceMatch[0].trim() : cleanContent.substring(0, 200) + '...';
}

// Helper function to parse content before first heading
function parseIntroContent(content: string) {
  // Find the first heading (# ## ### etc.)
  const headingMatch = content.match(/^(#{1,6}\s+.*$)/m);

  if (!headingMatch) {
    // No heading found, treat entire content as intro
    return {
      introContent: content,
      remainingContent: ''
    };
  }

  const headingIndex = headingMatch.index!;
  const introContent = content.substring(0, headingIndex).trim();
  const remainingContent = content.substring(headingIndex);

  return { introContent, remainingContent };
}

// Helper function to extract images and text from intro content
function extractImagesAndText(introContent: string) {
  // Match markdown images: ![alt](url)
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const images: Array<{alt: string, src: string}> = [];
  let match;

  while ((match = imageRegex.exec(introContent)) !== null) {
    images.push({
      alt: match[1],
      src: match[2]
    });
  }

  // Remove images from text content
  const textContent = introContent.replace(imageRegex, '').trim();

  return { textContent, images };
}

export default async function YearReviewTemplate({ entry }: YearReviewTemplateProps) {
  const year = parseInt(entry.title);

  // Determine period based on year
  const getPeriod = (year: number): string => {
    if (year >= 1999 && year <= 2016) return 'The End Of History';
    if (year >= 2017 && year <= 2033) return 'Networked Life Intensifies';
    if (year >= 2034 && year <= 2049) return 'The Great Disruption';
    if (year >= 2050 && year <= 2069) return 'Headlong Into The Hyperreal';
    if (year >= 2070 && year <= 2079) return 'The Second Moon Event';
    if (year >= 2080 && year <= 2099) return 'The Impending Collapse';
    return 'Unknown Period';
  };

  const period = getPeriod(year);

  // Parse the intro content before first heading
  const { introContent, remainingContent } = parseIntroContent(entry.content);
  const { textContent, images } = extractImagesAndText(introContent);

  // Get related articles for this year
  const relatedArticles = await getTimelineEntriesByYear(year);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto px-4 sm:px-8 md:px-16 lg:px-24 xl:px-36 pt-8 pb-12">
        {/* Content Section */}
        <article className="bg-white rounded-lg shadow-lg overflow-hidden mb-0">
          {/* Two-column intro layout if there's intro content */}
          {textContent && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 p-8" style={{backgroundColor: '#b4bdbc'}}>
              {/* Left column: Text content */}
              <div className="p-6" style={{fontSize: '32px', fontWeight: 'bold', lineHeight: '1.2'}}>
                <ReactMarkdown>{textContent}</ReactMarkdown>
              </div>

              {/* Right column: Image (if exists) */}
              <div className="flex justify-center items-start p-6">
                {images.length > 0 && (
                  <img
                    src={images[0].src}
                    alt={images[0].alt}
                    className="max-w-full h-auto rounded-lg shadow-md"
                  />
                )}
              </div>
            </div>
          )}

          <div className="pt-8 px-4 pb-0">
            {/* Remaining content */}
            {remainingContent && (
              <div className="prose prose-lg max-w-none">
                <ReactMarkdown>{remainingContent}</ReactMarkdown>
              </div>
            )}

            {/* Fallback if no intro parsing worked */}
            {!textContent && !remainingContent && (
              <div className="prose prose-lg max-w-none">
                <ReactMarkdown>{entry.content}</ReactMarkdown>
              </div>
            )}
          </div>

          {/* Articles and Topics Section (seamless, no extra heading, no border, no indent) */}
          {relatedArticles.length > 0 && (
            <div className="px-4 pt-4 pb-8">
              <div style={{ marginTop: 20 }}>
                {relatedArticles.map((article) => (
                  <div key={article.slug} className="mb-6">
                    <a
                      href={`/timeline/${article.slug}`}
                      className="text-lg font-semibold text-blue-600 hover:text-blue-800 block mb-1"
                    >
                      {article.title}
                    </a>
                    <p className="text-gray-700 mb-0">{getFirstSentence(article.content)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </article>

        {/* Year Navigation */}
        <div className="mt-8 bg-white rounded-lg shadow-lg p-6">
          <div className="flex justify-between items-center">
            <a
              href={`/timeline/year${year - 1}`}
              className="text-blue-600 hover:text-blue-800 font-semibold"
            >
              ← {year - 1}
            </a>
            <span className="text-gray-500">Timeline Navigation</span>
            <a
              href={`/timeline/year${year + 1}`}
              className="text-blue-600 hover:text-blue-800 font-semibold"
            >
              {year + 1} →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
