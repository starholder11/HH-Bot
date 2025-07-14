import React from 'react';
import ReactMarkdown from 'react-markdown';
import type { TimelineEntry } from '@/lib/content-reader';

interface YearReviewTemplateProps {
  entry: TimelineEntry;
}

export default function YearReviewTemplate({ entry }: YearReviewTemplateProps) {
  const year = entry.metadata?.year || parseInt(entry.title) || 2040;
  const period = entry.metadata?.period || 'Unknown Period';
  const theme = entry.metadata?.theme || 'default';

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
        <article className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="p-8">
            <div className="prose prose-lg max-w-none">
              <ReactMarkdown>{entry.content}</ReactMarkdown>
            </div>
          </div>
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
