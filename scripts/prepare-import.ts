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

/** util ─ convert slug (dash-case) → Title Case plus spacing before digits */
const slugToTitle = (slug: string) =>
  slug
    .replace(/-/g, ' ')           // dashes → space
    .replace(/([A-Za-z])(\d)/g, '$1 $2') // space before digits
    .replace(/\b\w/g, c => c.toUpperCase());

/** remove outer quotes:  "Monkey" → Monkey */
const unquote = (x: unknown) =>
  typeof x === 'string' && /^".*"$/.test(x) ? x.slice(1, -1) : x;

(async () => {
  // 1 ─ gather every *.yaml file from the unzip (authoritative metadata)
  const sources = await glob(`${IMPORT_ROOT}/**/*.yaml`);

  for (const src of sources) {
    const rawName = path.parse(src).name; // might already be slug or title
    const slug = slugify(rawName);
    const bodySrc = path.join(path.dirname(src), 'body.mdoc');

    // original title from YAML drives filenames/folders
    let originalYaml = await fs.readFile(src, 'utf8');
    const origParsed = matter(`---\n${originalYaml}\n---`).data as any;
    const titleText: string = origParsed.title ?? slugToTitle(slug);

    // read original YAML
    const rawYaml = await fs.readFile(src, 'utf8');
    const parsed = matter(`---\n${rawYaml}\n---`);

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

    // 6 ─ ensure slug field present
    (parsed.data as any).slug = slug;

    // sanitize title for path (remove slashes/colons etc.) but keep spaces
    const safeTitle = titleText.replace(/[\\/:*?"<>|]/g, '');

    // 7 ─ build destination paths using Title, not slug
    const ymlPath  = path.join(DEST_ROOT, `${safeTitle}.yaml`);
    const dirPath  = path.join(DEST_ROOT, safeTitle);
    const bodyPath = path.join(dirPath, 'body.mdoc');

    // 8 ─ decide whether to overwrite existing YAML
    let shouldWrite = true;
    try {
      const existingRaw = await fs.readFile(ymlPath, 'utf8');
      const existing = matter(`---\n${existingRaw}\n---`).data as any;
      if (existing?.title) {
        console.log(`⚠️  Skip (already exists): ${slug}`);
        shouldWrite = false;
      }
    } catch {}

    if (shouldWrite) {
      // @ts-expect-error gray-matter typings don’t include lineWidth option but the lib supports it
      let ymlOut = matter.stringify('', parsed.data, { lineWidth: 0 });
      // remove single quotes that gray-matter adds around these scalars
      ymlOut = ymlOut.replace(/^date:\s*'([^']+)'/m, 'date: $1');
      ymlOut = ymlOut.replace(/^categories:\s*'([^']+)'/m, 'categories: $1');
      await fs.writeFile(ymlPath, ymlOut);
    }

    // 9 ─ copy body.mdoc
    try {
      let bodyContent = await fs.readFile(bodySrc, 'utf8');
      // Convert legacy full-URL internal links to in-repo style: [text](text)
      bodyContent = bodyContent.replace(/\[([^\]]+)\]\(https?:\/\/starholder\.xyz\/index\.php[^)]*\)/gi, (_, txt) => {
        const title = slugToTitle(slugify(txt));
        return `[${title}](${title})`;
      });
      // Handle blockstar.com links -> derive title from slug in URL
      bodyContent = bodyContent.replace(/https?:\/\/(?:www\.)?blockstar\.com\/([\w-]+)\/?/gi, (_, s) => {
        return slugToTitle(s);
      });

      // Replace any slug-based links with Title-based links
      bodyContent = bodyContent.replace(/\[([^\]]+)\]\(([a-z0-9-]+)\)/g, (_, txt, targetSlug) => {
        const title = slugToTitle(targetSlug);
        return `[${title}](${title})`;
      });

      // As a safety net, strip any remaining bare URLs from that domain
      bodyContent = bodyContent.replace(/https?:\/\/starholder\.xyz\/index\.php\//gi, '');
      await fs.mkdir(dirPath, { recursive: true });
      await fs.writeFile(bodyPath, bodyContent.trimStart() + '\n');
    } catch (err) {
      console.error(`❌  Missing body.mdoc for ${slug} at ${bodySrc}`);
    }

    console.log(`✅  Processed → ${slug}`);
  }
})(); 