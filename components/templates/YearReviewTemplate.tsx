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

  // Get related articles for this year
  const relatedArticles = await getTimelineEntriesByYear(year);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 pt-8 pb-12">
        {/* Hero Section */}
        <div className="bg-white rounded-lg shadow-lg overflow-hidden mb-8">
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-8">
            <div className="text-center">
              <h1 className="text-5xl font-bold mb-4">{entry.title}</h1>
              <p className="text-xl opacity-90">{period}</p>
            </div>
          </div>
        </div>

        {/* Content Section */}
        <article className="bg-white rounded-lg shadow-lg overflow-hidden mb-8">
          <div className="p-8">
            <div className="prose prose-lg max-w-none">
              <ReactMarkdown>{entry.content}</ReactMarkdown>
            </div>
          </div>
        </article>

        {/* Articles and Topics Section */}
        {relatedArticles.length > 0 && (
          <div className="bg-white rounded-lg shadow-lg overflow-hidden mb-8">
            <div className="p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Articles and Topics:</h2>
              <div className="space-y-4">
                {relatedArticles.map((article) => (
                  <div key={article.slug} className="border-l-4 border-blue-500 pl-4">
                    <a
                      href={`/timeline/${article.slug}`}
                      className="text-lg font-semibold text-blue-600 hover:text-blue-800 block mb-2"
                    >
                      {article.title}
                    </a>
                    <p className="text-gray-700">{getFirstSentence(article.content)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

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
