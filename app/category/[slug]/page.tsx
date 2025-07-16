import { notFound } from 'next/navigation';
import { getAllTimelineEntries, type TimelineEntry } from '@/lib/content-reader';
import Link from 'next/link';

interface CategoryPageProps {
  params: {
    slug: string;
  };
}

// Helper function to extract first paragraph from content
function getFirstParagraph(content: string): string {
  // Remove markdown formatting and get first paragraph
  const cleanContent = content
    .replace(/^#+\s+/gm, '') // Remove headers
    .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove links
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '') // Remove images
    .trim();

  // Split by double newlines to get paragraphs
  const paragraphs = cleanContent.split(/\n\s*\n/);
  const firstParagraph = paragraphs[0] || '';

  // If first paragraph is too short, combine with second
  if (firstParagraph.length < 100 && paragraphs[1]) {
    return `${firstParagraph} ${paragraphs[1]}`;
  }

  return firstParagraph;
}

// Helper function to check if a category is a year and return appropriate link
function getCategoryLink(category: string): string {
  // Check if category is a 4-digit year between 1999-2099
  const yearMatch = category.match(/^\d{4}$/);
  if (yearMatch) {
    const year = parseInt(category);
    if (year >= 1999 && year <= 2099) {
      return `/timeline/year${year}`;
    }
  }

  // Default to category page
  return `/category/${category.toLowerCase().replace(/\s+/g, '-')}`;
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { slug } = params;

  // Convert slug back to category name (e.g., "the-collision" -> "The Collision")
  const categoryName = slug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  // Get all timeline entries
  const allEntries = await getAllTimelineEntries();

  // Filter entries that have this category
  const entriesInCategory = allEntries.filter(entry =>
    entry.metadata?.categories?.some((cat: string) =>
      cat.toLowerCase().replace(/\s+/g, '-') === slug
    )
  );

  if (entriesInCategory.length === 0) {
    notFound();
  }

  return (
    <div className="min-h-screen" style={{backgroundColor: '#b4bdbc'}}>
      <div className="max-w-4xl mx-auto py-12 px-6">
        <h1 className="text-4xl font-bold text-white mb-8">
          {categoryName}
        </h1>

        <div className="space-y-8">
          {entriesInCategory.map((entry) => (
            <div key={entry.slug} className="bg-white border border-gray-200 rounded-lg shadow-md overflow-hidden">
              <div className="p-6">
                {/* Header with title only */}
                <div className="flex justify-between items-start mb-4">
                  <h2 className="text-xl font-semibold text-gray-900">
                    <Link
                      href={`/timeline/${entry.slug}`}
                      className="hover:text-blue-600 transition-colors"
                    >
                      {entry.title}
                    </Link>
                  </h2>
                </div>

                {/* Content preview */}
                <p className="text-gray-700 leading-relaxed mb-4">
                  {getFirstParagraph(entry.content)}
                </p>

                {/* Categories in bottom right */}
                <div className="flex justify-end">
                  <div className="flex flex-wrap gap-2">
                    {entry.metadata?.categories
                      ?.filter((cat: string) => cat !== categoryName) // Don't show the current category
                      ?.map((category: string, index: number) => (
                        <Link
                          key={index}
                          href={getCategoryLink(category)}
                          className="inline-block bg-gray-100 text-gray-700 px-2 py-1 rounded text-sm hover:bg-gray-200 hover:text-gray-800 transition-colors"
                        >
                          {category}
                        </Link>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
