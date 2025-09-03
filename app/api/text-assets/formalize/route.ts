import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { Octokit } from '@octokit/rest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Body {
  slugs: string[];
  branch?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;
    const slugs = Array.isArray(body?.slugs) ? body.slugs.filter(Boolean) : [];
    const branch = body?.branch || 'main';
    if (!slugs.length) {
      return NextResponse.json({ success: false, error: 'No slugs provided' }, { status: 400 });
    }

    const isServerless = !!process.env.VERCEL;
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_PERSONAL_TOKEN;

    const results: Array<{ slug: string; ok: boolean; error?: string }> = [];

    if (isServerless) {
      if (!token) {
        return NextResponse.json({ success: false, error: 'Missing GITHUB_TOKEN in serverless environment' }, { status: 500 });
      }
      const octokit = new Octokit({ auth: token });
      const owner = 'starholder11';
      const repo = 'HH-Bot';

      for (const slug of slugs) {
        try {
          const indexPath = `content/timeline/${slug}/index.yaml`;
          // Fetch existing YAML to preserve fields
          let currentYaml: string | null = null;
          try {
            const { data } = await octokit.repos.getContent({ owner, repo, path: indexPath, ref: branch });
            if (!Array.isArray(data) && 'content' in data && (data as any).content) {
              currentYaml = Buffer.from((data as any).content, 'base64').toString('utf-8');
            }
          } catch {
            currentYaml = null;
          }

          const parsed = (currentYaml ? (yaml.load(currentYaml) as any) : {}) || {};
          parsed.slug = parsed.slug || slug;
          parsed.status = 'committed';
          parsed.date = parsed.date || new Date().toISOString();
          const nextYaml = yaml.dump(parsed, { noRefs: true });

          // Determine SHA if file exists
          let sha: string | undefined = undefined;
          try {
            const { data } = await octokit.repos.getContent({ owner, repo, path: indexPath, ref: branch });
            if (!Array.isArray(data) && 'sha' in data) sha = (data as any).sha;
          } catch {}

          await octokit.repos.createOrUpdateFileContents({
            owner,
            repo,
            path: indexPath,
            branch,
            message: `chore(text): formalize ${slug} (status: committed)`,
            content: Buffer.from(nextYaml, 'utf-8').toString('base64'),
            sha,
            committer: { name: 'text-bot', email: 'bot@starholder' },
            author: { name: 'text-bot', email: 'bot@starholder' },
          });

          results.push({ slug, ok: true });
        } catch (e: any) {
          results.push({ slug, ok: false, error: e?.message || String(e) });
        }
      }
      return NextResponse.json({ success: true, results });
    }

    // Local/dev: update files on disk
    for (const slug of slugs) {
      try {
        const baseDir = path.join(process.cwd(), 'content', 'timeline', slug);
        const indexPath = path.join(baseDir, 'index.yaml');
        let parsed: any = {};
        if (fs.existsSync(indexPath)) {
          const current = fs.readFileSync(indexPath, 'utf-8');
          parsed = (yaml.load(current) as any) || {};
        }
        parsed.slug = parsed.slug || slug;
        parsed.status = 'committed';
        parsed.date = parsed.date || new Date().toISOString();
        const nextYaml = yaml.dump(parsed, { noRefs: true });
        if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });
        fs.writeFileSync(indexPath, nextYaml, 'utf-8');
        results.push({ slug, ok: true });
      } catch (e: any) {
        results.push({ slug, ok: false, error: e?.message || String(e) });
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}


