import { NextRequest, NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { getDeployState, hasTimelineEntryChanged, hasUndeployedChanges } from '@/lib/deploy-state';
import { getTimelineEntryFromGit, timelineEntryExists, readContentFromGit } from '@/lib/git-content-reader';
import { getTimelineEntry } from '@/lib/content-reader';

interface PreviewParams {
  params: {
    slug: string;
  };
}

export async function GET(
  request: NextRequest,
  { params }: PreviewParams
) {
  const { slug } = params;
  
  try {
    console.log(`🔍 Checking preview for slug: ${slug}`);
    
    // Check if content has undeployed changes
    const hasChanges = await hasUndeployedChanges(slug);

    if (!hasChanges) {
      console.log(`🔄 No changes detected, redirecting to production for ${slug}`);
      // No changes - redirect to fast production page
      return NextResponse.redirect(new URL(`/timeline/${slug}`, request.url));
    }

    console.log(`📝 Changes detected, rendering preview for ${slug}`);
    
    // Has changes - render directly from Git
    const { content, title, date } = await readContentFromGit(slug);

    // Render the preview page with fresh Git content
    return new Response(
      renderPreviewHTML({
        title,
        content,
        slug,
        date,
      }),
      {
        headers: { 'Content-Type': 'text/html' },
      }
    );
  } catch (error) {
    console.error('Preview error:', error);
    return new Response('Preview not available', { status: 404 });
  }
}

interface PreviewData {
  title: string;
  content: string;
  slug: string;
  date: string;
}

function renderPreviewHTML({ title, content, slug, date }: PreviewData): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Preview: ${title}</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
          .prose img { max-width: 100%; height: auto; margin: 1rem 0; }
          .prose a { color: #2563eb; text-decoration: underline; }
          .prose a:hover { color: #1d4ed8; }
        </style>
      </head>
      <body class="bg-gray-50">
        <div class="max-w-4xl mx-auto py-8 px-4">
          <div class="bg-yellow-100 border border-yellow-400 rounded p-4 mb-8">
            <div class="flex items-center">
              <span class="text-yellow-800 font-semibold mr-2">🔄 Preview Mode</span>
              <span class="text-yellow-700">Showing saved changes (not yet deployed)</span>
            </div>
            <div class="mt-2 text-sm text-yellow-700">
              <a href="/timeline/${slug}" class="text-blue-600 hover:underline font-medium">View Published Version</a>
              <span class="mx-2">•</span>
              <span>Save in Keystatic first to see latest changes</span>
            </div>
          </div>
          
          <article class="bg-white rounded-lg shadow p-8">
            <header class="mb-6">
              <h1 class="text-4xl font-bold mb-2">${escapeHtml(title)}</h1>
              ${date ? `<time class="text-gray-600">${escapeHtml(date)}</time>` : ''}
            </header>
            
            <div class="prose prose-lg max-w-none">
              ${processMarkdown(content)}
            </div>
          </article>
          
          <div class="mt-8 text-center text-sm text-gray-500">
            <p>This is a preview of saved changes. The published version may be different.</p>
          </div>
        </div>
      </body>
    </html>
  `;
}

function processMarkdown(content: string): string {
  // Basic markdown processing for preview
  return content
    .replace(/^# (.*$)/gim, '<h1 class="text-3xl font-bold mb-4">$1</h1>')
    .replace(/^## (.*$)/gim, '<h2 class="text-2xl font-bold mb-3">$1</h2>')
    .replace(/^### (.*$)/gim, '<h3 class="text-xl font-bold mb-2">$1</h3>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-blue-600 hover:underline">$1</a>')
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="max-w-full h-auto my-4" />')
    .replace(/\n\n/g, '</p><p class="mb-4">')
    .replace(/^(.+)$/gm, '<p class="mb-4">$1</p>');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Handle POST requests for preview (useful for admin integration)
 */
export async function POST(
  request: NextRequest,
  { params }: PreviewParams
) {
  const { slug } = params;
  
  try {
    // Parse request body for additional preview options
    const body = await request.json().catch(() => ({}));
    const { forceGit = false } = body;
    
    console.log(`🔍 Preview POST request for slug: ${slug}, forceGit: ${forceGit}`);
    
    if (forceGit) {
      // Force Git rendering regardless of deploy state
      const deployState = await getDeployState();
      const latestCommit = deployState.latestCommit || 'main';
      const entry = await getTimelineEntryFromGit(slug, latestCommit);
      
      if (!entry) {
        return NextResponse.json(
          { error: 'Timeline entry not found' },
          { status: 404 }
        );
      }
      
      return NextResponse.json({
        preview: true,
        forceGit: true,
        slug,
        entry,
        deployState,
        renderedAt: new Date().toISOString(),
      });
    }
    
    // Use the same logic as GET
    return GET(request, { params });
    
  } catch (error) {
    console.error('❌ Preview POST API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 