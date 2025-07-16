import ReactMarkdown from 'react-markdown';
import type { TimelineEntry } from '@/lib/content-reader';
import YearReviewTemplate from './templates/YearReviewTemplate';
import { Footer } from './layout/Footer';

interface TimelineEntryProps {
  entry: TimelineEntry;
}

export default async function TimelineEntry({ entry }: TimelineEntryProps) {
  // Check if this should use year review template
  const isYearEntry = entry.metadata?.categories?.includes('Year');
  const titleAsNumber = parseInt(entry.title);
  const isYearInRange = titleAsNumber >= 1999 && titleAsNumber <= 2099;

  // Use YearReviewTemplate if it's a year entry with a year title
  if (isYearEntry && isYearInRange) {
    return <YearReviewTemplate entry={entry} />;
  }

  // Extract year and other categories from metadata
  const allCategories = entry.metadata?.categories || [];
  let year: string | null = null;
  const otherCategories: string[] = [];

  allCategories.forEach((category: string) => {
    // Check if category is a 4-digit year between 1999-2099
    const yearMatch = category.match(/^\d{4}$/);
    if (yearMatch) {
      const yearNumber = parseInt(yearMatch[0]);
      if (yearNumber >= 1999 && yearNumber <= 2099) {
        year = yearMatch[0];
        return;
      }
    }
    // If not a year, add to other categories
    otherCategories.push(category);
  });

  // Default rendering for entries without templates
  return (
    <div className="min-h-screen relative" style={{backgroundColor: '#b4bdbc'}}>
      {/* Info box in left margin - outside content container */}
      <div className="absolute w-48 bg-white border border-black p-4 hidden lg:block" style={{left: '50px', top: '200px'}}>
        <div className="text-base">
          <div className="font-bold mb-3">
            Year: {year ? (
              <a
                href={`/timeline/year${year}`}
                className="text-blue-600 hover:text-blue-800 underline font-normal"
              >
                {year}
              </a>
            ) : 'N/A'}
          </div>
          {otherCategories.length > 0 && (
            <>
              <div className="font-bold mb-3">Categories:</div>
              <div className="space-y-2">
                {otherCategories.map((category: string, index: number) => (
                  <div key={index} className="mb-2">
                    <a
                      href={`/category/${category.toLowerCase().replace(/\s+/g, '-')}`}
                      className="text-blue-600 hover:text-blue-800 underline text-base block"
                    >
                      {category}
                    </a>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 pt-10 pb-12">
        <article className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="p-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-6">{entry.title}</h1>
            <div className="prose prose-lg max-w-none">
              <ReactMarkdown>{entry.content}</ReactMarkdown>
            </div>
          </div>
        </article>
      </div>

      {/* Footer within the grey-green background */}
      <Footer />
    </div>
  );
}
