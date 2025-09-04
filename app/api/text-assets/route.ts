import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { Octokit } from '@octokit/rest';
// OAI upsert via shared library (SDK)
import { uploadFileToVectorStore } from '@/lib/openai-sync';
import crypto from 'crypto';
import Redis from 'ioredis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Removed stupid env var - UI toggle is the only control

function slugify(input: string): string {
  return (input || '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('[text-assets] POST body:', body);
    const {
      slug: rawSlug,
      title = 'Untitled',
      categories = [],
      source = 'layout',
      status = 'draft',
      mdx = '',
      commitOnSave: commitOnSaveInput,
      scribe_enabled,
      conversation_id
    } = body || {};

    const slug = slugify(rawSlug || title);
    if (!slug) {
      return NextResponse.json({ success: false, error: 'Missing slug/title' }, { status: 400 });
    }

    const baseDir = path.join(process.cwd(), 'content', 'timeline', slug);
    const indexPath = path.join(baseDir, 'index.yaml');
    const contentPath = path.join(baseDir, 'content.mdx');

    // Normalize commit flag early and compute status for YAML
    const commitOnSave = commitOnSaveInput === true; // Default false, only commit if explicitly requested
    const finalStatus = commitOnSave ? 'committed' : 'draft';
    const indexDoc = {
      slug,
      title,
      date: new Date().toISOString(),
      categories: Array.isArray(categories) ? categories : String(categories || '').split(',').map((s) => s.trim()).filter(Boolean),
      source,
      status: finalStatus,
      ...(typeof scribe_enabled === 'boolean' && { scribe_enabled }),
      ...(conversation_id && { conversation_id })
    };

    const indexYaml = yaml.dump(indexDoc, { noRefs: true });

    // Attempt OpenAI File Search upsert FIRST (immediate lore visibility per spec)
    let oai: { fileId?: string; vectorStoreFileId?: string } | undefined;
    try {
      // FAST PATH: versioned filename upload only (no listing or cleanup here)
      const body = String(mdx ?? '');
      const hash = crypto.createHash('sha256').update(body).digest('hex').slice(0, 8);
      const vectorName = `${slug}-body-${hash}.md`;
      const v = await uploadFileToVectorStore(body, vectorName);
      oai = { fileId: (v as any)?.file_id, vectorStoreFileId: (v as any)?.id };
      console.log('[text-assets] OAI upsert (fast) completed:', { vectorName, fileId: oai.fileId, vectorStoreFileId: oai.vectorStoreFileId });
    } catch (e) {
      console.warn('[text-assets] OAI upsert failed (non-blocking):', (e as Error)?.message || e);
    }

    // If running on Vercel serverless (read-only FS), optionally commit to GitHub
    const isReadOnly = !!process.env.VERCEL;
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_PERSONAL_TOKEN;

    if (isReadOnly) {
      // Respect commitOnSave toggle - skip Git commit if disabled
      if (!commitOnSave) {
        console.log('[text-assets] Skipping Git commit on save (commitOnSave=false)');
        return NextResponse.json({ success: true, slug, paths: { indexPath: null, contentPath: null }, oai, commit: 'skipped' });
      }

      if (!token) {
        console.error('[text-assets] Missing GITHUB_TOKEN in serverless environment');
        return NextResponse.json({ success: false, error: 'Serverless FS is read-only and GITHUB_TOKEN is not configured' }, { status: 500 });
      }

      const octokit = new Octokit({ auth: token });
      const owner = 'starholder11';
      const repo = 'HH-Bot';

      // Commit to Git when commitOnSave is enabled
      try {
        const branchRef = `heads/main`;
        const { data: refData } = await octokit.git.getRef({ owner, repo, ref: branchRef });
        const baseCommitSha = (refData as any).object?.sha as string;
        const { data: baseCommit } = await octokit.git.getCommit({ owner, repo, commit_sha: baseCommitSha });
        const baseTreeSha = (baseCommit as any).tree?.sha as string;

        const { data: indexBlob } = await octokit.git.createBlob({ owner, repo, content: indexYaml, encoding: 'utf-8' });
        const { data: contentBlob } = await octokit.git.createBlob({ owner, repo, content: String(mdx ?? ''), encoding: 'utf-8' });

        const { data: newTree } = await octokit.git.createTree({
          owner,
          repo,
          base_tree: baseTreeSha,
          tree: [
            { path: `content/timeline/${slug}/index.yaml`, mode: '100644', type: 'blob', sha: indexBlob.sha },
            { path: `content/timeline/${slug}/content.mdx`, mode: '100644', type: 'blob', sha: contentBlob.sha },
          ],
        });

        const message = `chore(text): create/update ${slug} (index+content)`;
        const { data: newCommit } = await octokit.git.createCommit({ owner, repo, message, tree: newTree.sha!, parents: [baseCommitSha] });
        await octokit.git.updateRef({ owner, repo, ref: branchRef, sha: newCommit.sha!, force: false });
        console.log('[text-assets] Committed files to GitHub in one commit:', { slug, commit: newCommit.sha });
      } catch (e) {
        console.error('[text-assets] GitHub single-commit write failed', e);
        return NextResponse.json({
          success: false,
          error: 'GitHub API write failed',
          details: e instanceof Error ? e.message : String(e)
        }, { status: 500 });
      }

      return NextResponse.json({ success: true, slug, paths: { indexPath: `github:content/timeline/${slug}/index.yaml`, contentPath: `github:content/timeline/${slug}/content.mdx` }, oai });
    }

    // Local/dev: write to filesystem
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }
    fs.writeFileSync(indexPath, indexYaml, 'utf-8');
    fs.writeFileSync(contentPath, String(mdx ?? ''), 'utf-8');

    console.log('[text-assets] Wrote files:', { indexPath, contentPath, bytes: { index: indexYaml.length, mdx: String(mdx ?? '').length } });
    return NextResponse.json({ success: true, slug, paths: { indexPath, contentPath }, oai });
  } catch (error) {
    console.error('[text-assets] POST failed', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error', stack: error instanceof Error ? error.stack : undefined }, { status: 500 });
  }
}


