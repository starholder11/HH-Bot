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

// Helper function to parse content by headers into sections
function parseContentSections(content: string) {
  if (!content.trim()) return [];

  // Split content by headers (## or ###)
  const sections = [];
  const lines = content.split('\n');
  let currentSection = { header: '', content: '' };

  for (const line of lines) {
    const headerMatch = line.match(/^(#{2,3})\s+(.+)$/);

    if (headerMatch) {
      // Save previous section if it has content
      if (currentSection.header || currentSection.content.trim()) {
        sections.push(currentSection);
      }
      // Start new section
      currentSection = {
        header: headerMatch[2].trim(),
        content: ''
      };
    } else {
      // Add line to current section content
      currentSection.content += line + '\n';
    }
  }

  // Add the last section
  if (currentSection.header || currentSection.content.trim()) {
    sections.push(currentSection);
  }

  return sections;
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

  // Parse remaining content into sections
  const contentSections = parseContentSections(remainingContent);

  // Get related articles for this year (but don't create separate section since it's in content)
  const relatedArticles = await getTimelineEntriesByYear(year);

  // Populate Articles and Topics section with related articles if it exists
  const populatedSections = contentSections.map(section => {
    if (section.header.toLowerCase().includes('articles and topics')) {
      const articlesContent = relatedArticles.map((article) => {
        const firstSentence = getFirstSentence(article.content);
        return `**[${article.title}](/timeline/${article.slug})**\n\n${firstSentence}`;
      }).join('\n\n');

      return {
        ...section,
        content: articlesContent
      };
    }
    return section;
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto px-4 sm:px-8 md:px-16 lg:px-24 xl:px-36 pt-8 pb-12">
        {/* Content Section */}
        <article className="bg-white rounded-lg shadow-lg overflow-hidden mb-0">
          {/* Two-column intro layout if there's intro content */}
          {textContent && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 p-8" style={{backgroundColor: '#b4bdbc'}}>
              {/* Left column: Text content */}
              <div className="p-6" style={{fontSize: '32px', lineHeight: '1.2'}}>
                <ReactMarkdown>{textContent}</ReactMarkdown>
              </div>

              {/* Right column: Image (if exists) */}
              <div className="flex justify-center items-start p-6">
                {images.length > 0 && (
                  <img
                    src={images[0].src}
                    alt={images[0].alt}
                    className="max-w-full h-auto rounded-2xl shadow-md"
                  />
                )}
              </div>
            </div>
          )}

          {/* Two-column sections for remaining content */}
          {populatedSections.map((section, index) => (
            <div key={index} className="grid grid-cols-1 md:grid-cols-[25%_75%] gap-8 p-8">
              {/* Left column: Header */}
              <div className="p-6">
                <h2 className="text-3xl font-bold mb-4">{section.header}</h2>
              </div>

              {/* Right column: Content */}
              <div className="p-6 pr-8">
                <div className="prose prose-lg max-w-none">
                  <ReactMarkdown>{section.content}</ReactMarkdown>
                </div>
              </div>
            </div>
          ))}

          {/* Fallback if no sections were created */}
          {populatedSections.length === 0 && remainingContent && (
            <div className="pt-8 px-4 pb-0">
              <div className="prose prose-lg max-w-none">
                <ReactMarkdown>{remainingContent}</ReactMarkdown>
              </div>
            </div>
          )}
        </article>

        {/* Year Navigation */}
        <div className="bg-white rounded-lg shadow-lg px-6 pt-2 pb-6" style={{ paddingBottom: '55px' }}>
          <div className="flex justify-center items-center text-lg">
            <a
              href={`/timeline/year${year - 1}`}
              className="text-black hover:text-gray-700 no-underline"
              style={{ paddingRight: '20px' }}
            >
              ← {year - 1}
            </a>
            <span className="text-black">Timeline Navigation</span>
            <a
              href={`/timeline/year${year + 1}`}
              className="text-black hover:text-gray-700 no-underline"
              style={{ paddingLeft: '20px' }}
            >
              {year + 1} →
            </a>
          </div>
        </div>

        {/* Footer Logo */}
        <div className="mt-8 mb-8 flex justify-center">
          <a href="/" className="inline-block">
            <img
              src="/logo.png"
              alt="Starholder Logo"
              className="w-16 h-16 rounded-full shadow-md object-cover hover:shadow-lg transition-shadow duration-200"
              style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.10)' }}
            />
          </a>
        </div>
      </div>
    </div>
  );
}
