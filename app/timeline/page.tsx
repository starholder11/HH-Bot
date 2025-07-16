import { getAllTimelineEntries, type TimelineEntry } from '@/lib/content-reader';
import Link from 'next/link';
import { Footer } from '@/components/layout/Footer';

// Helper function to extract first paragraph from content
function getFirstParagraph(content: string): string {
  const paragraphs = content.split('\n\n');
  const firstParagraph = paragraphs.find(p => p.trim().length > 0) || '';
  return firstParagraph.length > 200
    ? firstParagraph.substring(0, 200) + '...'
    : firstParagraph;
}

// Helper function to extract year from categories
function extractYear(categories: string[]): string | null {
  for (const category of categories) {
    const yearMatch = category.match(/^\d{4}$/);
    if (yearMatch) {
      const yearNumber = parseInt(yearMatch[0]);
      if (yearNumber >= 1999 && yearNumber <= 2099) {
        return yearMatch[0];
      }
    }
  }
  return null;
}

// Helper function to get other categories (non-year)
function getOtherCategories(categories: string[]): string[] {
  return categories.filter(category => {
    const yearMatch = category.match(/^\d{4}$/);
    if (yearMatch) {
      const yearNumber = parseInt(yearMatch[0]);
      return !(yearNumber >= 1999 && yearNumber <= 2099);
    }
    return true;
  });
}

export default async function TimelinePage() {
  const entries = await getAllTimelineEntries();

  // Group entries by year
  const entriesByYear: { [year: string]: TimelineEntry[] } = {};

  entries.forEach((entry: TimelineEntry) => {
    const year = extractYear(entry.metadata?.categories || []);
    if (year) {
      if (!entriesByYear[year]) {
        entriesByYear[year] = [];
      }
      entriesByYear[year].push(entry);
    }
  });

  // Sort years chronologically and entries within each year alphabetically
  const sortedYears = Object.keys(entriesByYear).sort((a, b) => parseInt(a) - parseInt(b));

  sortedYears.forEach(year => {
    entriesByYear[year].sort((a, b) => a.title.localeCompare(b.title));
  });

  return (
    <div className="min-h-screen" style={{backgroundColor: '#b4bdbc'}}>
      <div className="max-w-4xl mx-auto px-4 pt-10 pb-12">
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="p-8">
            <h1 className="text-4xl font-bold text-gray-900 mb-6">Timeline Chronology</h1>

            <div className="mb-8 text-gray-700 leading-relaxed space-y-4">
              <p>
                In 1999 Starholder is an exact copy of our world, but that will change. It will drift from ours, slowly at first, but picking up speed until our two worlds diverge wildly. Each one pursuing their own destinies as they confront an accelerating networked future on the brink of ecological collapse.
              </p>
              <p>
                The stories and events of the Starholder timeline are presented below in chronological order.
              </p>
            </div>

            {sortedYears.length === 0 ? (
              <p className="text-gray-600">No timeline entries found with year categories.</p>
            ) : (
              <div className="space-y-8">
                {sortedYears.map(year => (
                  <div key={year} className="border-b border-gray-200 pb-6 last:border-b-0">
                    <h2 className="text-2xl font-bold text-gray-900 mb-4">{year}:</h2>
                    <div className="space-y-4">
                      {entriesByYear[year].map(entry => {
                        const otherCategories = getOtherCategories(entry.metadata?.categories || []);
                        const firstParagraph = getFirstParagraph(entry.content);

                        return (
                          <div key={entry.slug} className="bg-gray-50 rounded-lg p-4 hover:bg-gray-100 transition-colors">
                            <h3 className="text-lg font-semibold text-gray-900 mb-2">
                              <Link
                                href={`/timeline/${entry.slug}`}
                                className="hover:text-blue-600 transition-colors"
                              >
                                {entry.title}
                              </Link>
                            </h3>

                            {firstParagraph && (
                              <p className="text-gray-700 mb-3 leading-relaxed">
                                {firstParagraph}
                              </p>
                            )}

                            {otherCategories.length > 0 && (
                              <div className="flex flex-wrap gap-2">
                                {otherCategories.map((category, index) => (
                                  <Link
                                    key={index}
                                    href={`/category/${category.toLowerCase().replace(/\s+/g, '-')}`}
                                    className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full hover:bg-blue-200 transition-colors"
                                  >
                                    {category}
                                  </Link>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer within the grey-green background */}
      <Footer />
    </div>
  );
}
