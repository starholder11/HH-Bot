import { NextRequest, NextResponse } from 'next/server';
import Redis from 'ioredis';
import { Octokit } from '@octokit/rest';
import yaml from 'js-yaml';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BATCH_MAX = Number(process.env.TEXT_ASSETS_BATCH_MAX || 10);

export async function POST(_req: NextRequest) {
  try {
    const redisUrl = process.env.REDIS_AGENTIC_URL || process.env.REDIS_URL;
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_PERSONAL_TOKEN;
    if (!redisUrl) return NextResponse.json({ success: false, error: 'Redis not configured' }, { status: 500 });
    if (!token) return NextResponse.json({ success: false, error: 'GITHUB_TOKEN not configured' }, { status: 500 });

    const r = new Redis(redisUrl);
    // Pull up to BATCH_MAX unique slugs
    const all = await r.lrange('textAssets:pending', 0, -1);
    const unique = Array.from(new Set(all)).slice(0, BATCH_MAX);
    // Trim list by removing processed slugs (all occurrences)
    for (const s of unique) await r.lrem('textAssets:pending', 0, s);

    if (unique.length === 0) {
      await r.quit();
      return NextResponse.json({ success: true, processed: 0 });
    }

    // Build a single commit tree
    const octokit = new Octokit({ auth: token });
    const owner = 'starholder11';
    const repo = 'HH-Bot';
    const branchRef = `heads/main`;
    const { data: refData } = await octokit.git.getRef({ owner, repo, ref: branchRef });
    const baseCommitSha = (refData as any).object?.sha as string;
    const { data: baseCommit } = await octokit.git.getCommit({ owner, repo, commit_sha: baseCommitSha });
    const baseTreeSha = (baseCommit as any).tree?.sha as string;

    const treeEntries: any[] = [];
    const processed: string[] = [];

    for (const slug of unique) {
      try {
        const draftRaw = await r.get(`textAsset:draft:${slug}`);
        if (!draftRaw) continue;
        const draft = JSON.parse(draftRaw) as { slug: string; indexYaml: string; mdx: string };

        // Ensure status defaults to draft unless already set
        let parsed: any = {};
        try { parsed = yaml.load(draft.indexYaml) as any; } catch {}
        parsed.slug = parsed.slug || draft.slug;
        parsed.status = parsed.status || 'draft';
        const nextYaml = yaml.dump(parsed, { noRefs: true });

        const idxBlob = await octokit.git.createBlob({ owner, repo, content: nextYaml, encoding: 'utf-8' });
        const mdxBlob = await octokit.git.createBlob({ owner, repo, content: draft.mdx, encoding: 'utf-8' });
        treeEntries.push({ path: `content/timeline/${slug}/index.yaml`, mode: '100644', type: 'blob', sha: idxBlob.data.sha });
        treeEntries.push({ path: `content/timeline/${slug}/content.mdx`, mode: '100644', type: 'blob', sha: mdxBlob.data.sha });
        processed.push(slug);
      } catch (e) {
        // On error, re-enqueue
        await r.rpush('textAssets:pending', slug);
      }
    }

    if (treeEntries.length === 0) {
      await r.quit();
      return NextResponse.json({ success: true, processed: 0 });
    }

    const { data: newTree } = await octokit.git.createTree({ owner, repo, base_tree: baseTreeSha, tree: treeEntries });
    const message = `chore(text): batch commit ${processed.length} assets`;
    const { data: newCommit } = await octokit.git.createCommit({ owner, repo, message, tree: newTree.sha!, parents: [baseCommitSha] });
    await octokit.git.updateRef({ owner, repo, ref: branchRef, sha: newCommit.sha!, force: false });

    // Cleanup processed drafts
    for (const s of processed) await r.del(`textAsset:draft:${s}`);
    await r.quit();

    return NextResponse.json({ success: true, processed: processed.length, commit: newCommit.sha });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || String(err) }, { status: 500 });
  }
}


