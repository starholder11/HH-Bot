import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { Octokit } from '@octokit/rest';
// OpenAI upsert uses native fetch/FormData/Blob available in Next.js runtime

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
      mdx = ''
    } = body || {};

    const slug = slugify(rawSlug || title);
    if (!slug) {
      return NextResponse.json({ success: false, error: 'Missing slug/title' }, { status: 400 });
    }

    const baseDir = path.join(process.cwd(), 'content', 'timeline', slug);
    const indexPath = path.join(baseDir, 'index.yaml');
    const contentPath = path.join(baseDir, 'content.mdx');

    const indexDoc = {
      slug,
      title,
      date: new Date().toISOString(),
      categories: Array.isArray(categories) ? categories : String(categories || '').split(',').map((s) => s.trim()).filter(Boolean),
      source,
      status,
    };

    const indexYaml = yaml.dump(indexDoc, { noRefs: true });

    // If running on Vercel serverless (read-only FS), fallback to GitHub commit
    const isReadOnly = !!process.env.VERCEL;
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_PERSONAL_TOKEN;

    if (isReadOnly) {
      if (!token) {
        console.error('[text-assets] Missing GITHUB_TOKEN in serverless environment');
        return NextResponse.json({ success: false, error: 'Serverless FS is read-only and GITHUB_TOKEN is not configured' }, { status: 500 });
      }

      const octokit = new Octokit({ auth: token });
      const owner = 'starholder11';
      const repo = 'HH-Bot';

      async function upsertFile(filePath: string, content: string, message: string) {
        try {
          // Check if file exists to get sha
          let sha: string | undefined = undefined;
          try {
            const { data } = await octokit.repos.getContent({ owner, repo, path: filePath, ref: 'main' });
            if (!Array.isArray(data) && 'sha' in data) sha = (data as any).sha;
          } catch (e) {
            // not found is fine, we'll create it
          }

          await octokit.repos.createOrUpdateFileContents({
            owner, repo, path: filePath, branch: 'main',
            message,
            content: Buffer.from(content, 'utf-8').toString('base64'),
            sha,
            committer: { name: 'text-bot', email: 'bot@starholder' },
            author: { name: 'text-bot', email: 'bot@starholder' },
          });
        } catch (e) {
          console.error('[text-assets] GitHub upsert failed', filePath, e);
          throw e;
        }
      }

      await upsertFile(`content/timeline/${slug}/index.yaml`, indexYaml, `chore(text): create/update ${slug} index`);
      await upsertFile(`content/timeline/${slug}/content.mdx`, String(mdx ?? ''), `chore(text): create/update ${slug} content`);

      console.log('[text-assets] Committed files to GitHub:', { slug });
      return NextResponse.json({ success: true, slug, paths: { indexPath: `github:content/timeline/${slug}/index.yaml`, contentPath: `github:content/timeline/${slug}/content.mdx` } });
    }

    // Local/dev: write to filesystem
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }
    fs.writeFileSync(indexPath, indexYaml, 'utf-8');
    fs.writeFileSync(contentPath, String(mdx ?? ''), 'utf-8');

    console.log('[text-assets] Wrote files:', { indexPath, contentPath, bytes: { index: indexYaml.length, mdx: String(mdx ?? '').length } });

    // Attempt OpenAI File Search upsert (non-blocking)
    let oai: { fileId?: string; vectorStoreFileId?: string } | undefined;
    try {
      oai = await upsertToOpenAI(slug, title, String(mdx ?? ''));
    } catch (e) {
      console.warn('[text-assets] OAI upsert failed (non-blocking):', (e as Error)?.message || e);
    }

    return NextResponse.json({ success: true, slug, paths: { indexPath, contentPath }, oai });
  } catch (error) {
    console.error('[text-assets] POST failed', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error', stack: error instanceof Error ? error.stack : undefined }, { status: 500 });
  }
}
async function upsertToOpenAI(slug: string, title: string, mdx: string): Promise<{ fileId?: string; vectorStoreFileId?: string }> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_APIKEY || process.env.OAI_API_KEY;
  const vectorStoreId = process.env.OAI_VECTOR_STORE_ID || process.env.OPENAI_VECTOR_STORE_ID || process.env.OPENAI_VECTORSTORE_ID;
  if (!apiKey) {
    console.log('[text-assets][oai] Skipping upsert: OPENAI_API_KEY not set');
    return {};
  }

  // Upload file to OpenAI Files
  const form = new FormData();
  const filename = `${slug}.mdx`;
  form.append('file', new Blob([mdx], { type: 'text/markdown' }), filename);
  form.append('purpose', 'assistants');

  const uploadRes = await fetch('https://api.openai.com/v1/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });
  if (!uploadRes.ok) {
    const text = await uploadRes.text();
    throw new Error(`OpenAI file upload failed: ${uploadRes.status} ${text}`);
  }
  const uploadJson: any = await uploadRes.json();
  const fileId: string | undefined = uploadJson?.id;
  console.log('[text-assets][oai] Uploaded file to OpenAI:', { fileId, filename });

  let vectorStoreFileId: string | undefined;
  if (fileId && vectorStoreId) {
    const attachRes = await fetch(`https://api.openai.com/v1/vector_stores/${vectorStoreId}/files`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file_id: fileId }),
    });
    if (!attachRes.ok) {
      const text = await attachRes.text();
      throw new Error(`OpenAI vector store attach failed: ${attachRes.status} ${text}`);
    }
    const attachJson: any = await attachRes.json();
    vectorStoreFileId = attachJson?.id || attachJson?.data?.[0]?.id;
    console.log('[text-assets][oai] Attached file to vector store:', { vectorStoreId, vectorStoreFileId });
  } else if (!vectorStoreId) {
    console.log('[text-assets][oai] Skipping vector store attach: OAI_VECTOR_STORE_ID not set');
  }

  return { fileId, vectorStoreFileId };
}


