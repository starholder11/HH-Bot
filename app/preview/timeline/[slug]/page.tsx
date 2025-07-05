import { notFound, redirect } from 'next/navigation';
import TimelineEntry from '@/components/timeline-entry';
import type { TimelineEntry as TimelineEntryType } from '@/lib/content-reader';

interface PreviewPageProps {
  params: {
    slug: string;
  };
}

async function getPreviewData(slug: string) {
  try {
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : 'http://localhost:3000';
    
    const response = await fetch(
      `${baseUrl}/api/preview/timeline/${slug}`,
      { cache: 'no-store' }
    );
    
    if (!response.ok) {
      if (response.status === 404) {
        return { notFound: true };
      }
      throw new Error(`Preview API error: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching preview data:', error);
    throw error;
  }
}

export default async function PreviewPage({ params }: PreviewPageProps) {
  const { slug } = params;
  
  try {
    const data = await getPreviewData(slug);
    
    if (data.notFound) {
      notFound();
    }
    
    // If the API redirected to production, follow the redirect
    if (data.redirect) {
      redirect(`/timeline/${slug}`);
    }
    
    const entry: TimelineEntryType = data.entry;
    
    if (!entry) {
      notFound();
    }
    
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 py-8">
          {/* Preview indicator */}
          <div className="mb-4 p-3 bg-yellow-100 border border-yellow-300 rounded-lg">
            <div className="flex items-center text-yellow-800">
              <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span className="font-medium">Preview Mode</span>
              <span className="ml-2 text-sm">
                (Showing latest changes from Git)
              </span>
            </div>
            {data.deployState && (
              <div className="mt-2 text-sm text-yellow-700">
                <div>Latest commit: {data.deployState.latestCommit?.substring(0, 8)}</div>
                {data.deployState.deployedCommit && (
                  <div>Deployed commit: {data.deployState.deployedCommit.substring(0, 8)}</div>
                )}
              </div>
            )}
          </div>
          
          <TimelineEntry entry={entry} />
        </div>
      </div>
    );
    
  } catch (error) {
    console.error('Error in preview page:', error);
    notFound();
  }
} 