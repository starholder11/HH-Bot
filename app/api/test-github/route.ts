import { NextRequest, NextResponse } from 'next/server';
import { Octokit } from '@octokit/rest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_PERSONAL_TOKEN;
    
    if (!token) {
      return NextResponse.json({ 
        error: 'No GitHub token configured',
        env_vars: {
          GITHUB_TOKEN: !!process.env.GITHUB_TOKEN,
          GH_TOKEN: !!process.env.GH_TOKEN,
          GITHUB_PERSONAL_TOKEN: !!process.env.GITHUB_PERSONAL_TOKEN,
          VERCEL: !!process.env.VERCEL
        }
      }, { status: 500 });
    }

    const octokit = new Octokit({ auth: token });
    
    // Test basic GitHub API access
    const { data: user } = await octokit.rest.users.getAuthenticated();
    const { data: repo } = await octokit.rest.repos.get({ 
      owner: 'starholder11', 
      repo: 'HH-Bot' 
    });

    return NextResponse.json({
      success: true,
      github_user: user.login,
      repo_access: true,
      repo_name: repo.name,
      token_length: token.length
    });

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      details: error
    }, { status: 500 });
  }
}
