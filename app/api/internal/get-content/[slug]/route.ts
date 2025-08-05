import { NextRequest, NextResponse } from 'next/server';
import { Octokit } from '@octokit/rest';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

async function getFileContentFromGitHub(filePath: string, branch: string = 'main'): Promise<string> {
  try {
    const response = await octokit.rest.repos.getContent({
      owner: 'starholder11',
      repo: 'HH-Bot',
      path: filePath,
      ref: branch,
    });

    if ('content' in response.data) {
      return Buffer.from(response.data.content, 'base64').toString('utf-8');
    }
    throw new Error('File content not found');
  } catch (error) {
    throw new Error(`Failed to fetch ${filePath}: ${error}`);
  }
}

async function findFolderNameBySlug(slug: string): Promise<string | null> {
  try {
    // First, try to find a folder that matches the slug when converted
    const response = await octokit.rest.repos.getContent({
      owner: 'starholder11',
      repo: 'HH-Bot',
      path: 'content/timeline',
      ref: 'main',
    });

    if (Array.isArray(response.data)) {
      for (const item of response.data) {
        if (item.type === 'dir') {
          const folderSlug = item.name.replace(/\s+/g, '-').toLowerCase();
          if (folderSlug === slug) {
            return item.name;
          }
        }
      }
    }

    return null;
  } catch (error) {
    console.error('Error finding folder by slug:', error);
    return null;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const { slug } = params;

    if (!slug) {
      return NextResponse.json(
        { error: 'Slug parameter is required' },
        { status: 400 }
      );
    }

    console.log(`🔍 Looking for content with slug: ${slug}`);

    // Find the actual folder name
    const folderName = await findFolderNameBySlug(slug);
    if (!folderName) {
      return NextResponse.json(
        { error: `No folder found for slug: ${slug}` },
        { status: 404 }
      );
    }

    console.log(`📁 Found folder: ${folderName}`);

    // Try to get content from GitHub first
    try {
      const contentPath = `content/timeline/${folderName}/content.mdx`;
      const indexPath = `content/timeline/${folderName}/index.yaml`;

      const [contentData, indexData] = await Promise.all([
        getFileContentFromGitHub(contentPath),
        getFileContentFromGitHub(indexPath),
      ]);

      return NextResponse.json({
        success: true,
        slug,
        folderName,
        content: contentData,
        metadata: indexData,
        source: 'github'
      });
    } catch (githubError) {
      console.warn('GitHub fetch failed, trying local:', githubError);

      // Fallback to local filesystem
      const contentPath = path.join(process.cwd(), 'content', 'timeline', folderName, 'content.mdx');
      const indexPath = path.join(process.cwd(), 'content', 'timeline', folderName, 'index.yaml');

      if (!fs.existsSync(contentPath) || !fs.existsSync(indexPath)) {
        return NextResponse.json(
          { error: `Content files not found for slug: ${slug}` },
          { status: 404 }
        );
      }

      const contentData = fs.readFileSync(contentPath, 'utf-8');
      const indexData = fs.readFileSync(indexPath, 'utf-8');

      return NextResponse.json({
        success: true,
        slug,
        folderName,
        content: contentData,
        metadata: indexData,
        source: 'local'
      });
    }
  } catch (error) {
    console.error('Error in get-content API:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
