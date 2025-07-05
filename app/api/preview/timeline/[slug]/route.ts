import { NextRequest, NextResponse } from 'next/server';
import { getDeployState, hasTimelineEntryChanged } from '@/lib/deploy-state';
import { getTimelineEntryFromGit, timelineEntryExists } from '@/lib/git-content-reader';
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
    console.log(`🔍 Preview request for slug: ${slug}`);
    
    // Check if the timeline entry exists
    const exists = await timelineEntryExists(slug);
    if (!exists) {
      console.log(`❌ Timeline entry not found: ${slug}`);
      return NextResponse.json(
        { error: 'Timeline entry not found' },
        { status: 404 }
      );
    }
    
    // Get deploy state to determine if content has changed
    const deployState = await getDeployState();
    console.log('📊 Deploy state:', {
      isDeployed: deployState.isDeployed,
      hasChanges: deployState.hasChanges,
      deployedCommit: deployState.deployedCommit?.substring(0, 8),
      latestCommit: deployState.latestCommit?.substring(0, 8),
    });
    
    // Check if this specific timeline entry has changes
    const hasChanges = await hasTimelineEntryChanged(slug);
    console.log(`🔄 Timeline entry ${slug} has changes:`, hasChanges);
    
    if (!hasChanges && deployState.isDeployed) {
      // Content unchanged - return preview data with redirect flag
      console.log(`✅ Content unchanged, returning preview data with redirect flag`);
      
      // Still fetch the entry for preview display
      const latestCommit = deployState.latestCommit || 'main';
      const entry = await getTimelineEntryFromGit(slug, latestCommit);
      
      if (!entry) {
        return NextResponse.json(
          { error: 'Failed to fetch timeline entry' },
          { status: 500 }
        );
      }
      
      return NextResponse.json({
        preview: true,
        redirect: true,
        redirectUrl: `/timeline/${slug}`,
        slug,
        entry,
        deployState: {
          isDeployed: deployState.isDeployed,
          hasChanges: deployState.hasChanges,
          deployedCommit: deployState.deployedCommit,
          latestCommit: deployState.latestCommit,
        },
        renderedAt: new Date().toISOString(),
      });
    }
    
    // Content has changes or not deployed - render from Git
    console.log(`🔄 Content has changes, rendering from Git API`);
    
    // Get the latest commit SHA for Git API calls
    const latestCommit = deployState.latestCommit || 'main';
    
    // Fetch content directly from GitHub API
    const entry = await getTimelineEntryFromGit(slug, latestCommit);
    
    if (!entry) {
      console.log(`❌ Failed to fetch timeline entry from Git: ${slug}`);
      return NextResponse.json(
        { error: 'Failed to fetch timeline entry' },
        { status: 500 }
      );
    }
    
    // Return the preview data
    console.log(`✅ Preview rendered from Git for: ${slug}`);
    
    return NextResponse.json({
      preview: true,
      slug,
      entry,
      deployState: {
        isDeployed: deployState.isDeployed,
        hasChanges: deployState.hasChanges,
        deployedCommit: deployState.deployedCommit,
        latestCommit: deployState.latestCommit,
      },
      renderedAt: new Date().toISOString(),
    });
    
  } catch (error) {
    console.error('❌ Preview API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
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