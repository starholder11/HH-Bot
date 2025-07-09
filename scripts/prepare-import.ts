import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import glob from 'fast-glob';

/* CHANGE THESE ONLY IF YOUR LAYOUT MOVES */
const IMPORT_ROOT = 'import_src';           // unzip export here
const DEST_ROOT   = 'content/timeline';     // repo destination

/** util ─ convert title → slug */
const slugify = (s: string) =>
  s.toLowerCase()
   .trim()
   .replace(/[^\w\s-]/g, '')   // remove punctuation
   .replace(/\s+/g, '-')        // spaces → dash
   .replace(/-+/g, '-');         // collapse dashes

/** remove outer quotes:  "Monkey" → Monkey */
const unquote = (x: unknown) =>
  typeof x === 'string' && /^".*"$/.test(x) ? x.slice(1, -1) : x;

(async () => {
  // 1 ─ gather every *.md(x) file from the unzip
  const sources = await glob(`${IMPORT_ROOT}/**/*.{md,markdown,mdx,mdoc}`);

  for (const src of sources) {
    const raw    = await fs.readFile(src, 'utf8');
    const parsed = matter(raw); // ⇢ { data, content }

    // 2 ─ prune WordPress-specific keys
    delete (parsed.data as any).wordpress_id;
    delete (parsed.data as any).status;

    // 3 ─ un-quote scalars & squash categories
    Object.keys(parsed.data).forEach(k => {
      (parsed.data as any)[k] = unquote((parsed.data as any)[k]);
    });

    if (Array.isArray(parsed.data.categories)) {
      (parsed.data as any).categories = (parsed.data as any).categories.join(', ');
    }

    // 4 ─ default optional arrays
    (parsed.data as any).gallery     ??= [];
    (parsed.data as any).attachments ??= [];

    // 5 ─ normalise date YYYY-MM-DD (strip time)
    if (typeof (parsed.data as any).date === 'string') {
      (parsed.data as any).date = (parsed.data as any).date.split(' ')[0];
    }

    // 6 ─ build destination paths
    const slug     = slugify((parsed.data as any).title || path.parse(src).name);
    (parsed.data as any).slug = slug; // keep slug field for Keystatic validation
    const ymlPath  = path.join(DEST_ROOT, `${slug}.yaml`);
    const dirPath  = path.join(DEST_ROOT, slug);
    const bodyPath = path.join(dirPath, 'body.mdoc');

    // 7 ─ collision guard
    try {
      await fs.stat(ymlPath);
      console.log(`⚠️  Skip (already exists): ${slug}`);
      continue;
    } catch {}

    // 8 ─ write YAML (no quotes)
    // @ts-expect-error gray-matter typings don’t include lineWidth option but the lib supports it
    const yml = matter.stringify('', parsed.data, { lineWidth: 0 });
    await fs.writeFile(ymlPath, yml);

    // 9 ─ write body.mdoc
    await fs.mkdir(dirPath, { recursive: true });
    await fs.writeFile(bodyPath, parsed.content.trimStart() + '\n');

    console.log(`✅  Imported → ${slug}`);
  }
})(); 