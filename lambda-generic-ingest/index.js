// Generic ingestion Lambda worker
// Consumes SQS "analysis" messages for ALL media types (image, audio, video, keyframe, text)
// and pushes them to LanceDB using the shared ParallelIngestionService logic.

const https = require('https');
const { URL } = require('url');

// bundle-friendly import – compiled ParallelIngestionService is included in the layer or zip
const { ingestAsset } = require('../lib/ingestion');
const { ParallelIngestionService } = require('../lib/ingestion');

/** Basic fetch helper that works inside the Lambda runtime without node-fetch */
function fetch(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const options = {
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: opts.method || 'GET',
      headers: opts.headers || {},
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          json: () => Promise.resolve(JSON.parse(data)),
          text: () => Promise.resolve(data),
        });
      });
    });
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

exports.handler = async (event) => {
  for (const record of event.Records) {
    try {
      const msg = JSON.parse(record.body);
      console.log('[generic-worker] Processing message', msg);

      // Only process LanceDB ingestion messages, not video processing or other jobs
      if (!['post_labeling_ingestion', 'refresh'].includes(msg.stage) && msg.mediaType !== 'text') {
        console.log('[generic-worker] Skipping non-ingestion message (missing valid stage)');
        continue;
      }

      switch (msg.mediaType) {
        case 'text':
          await handleText(msg);
          break;
        case 'image':
        case 'audio':
        case 'video':
        case 'keyframe':
          await handleAsset(msg);
          break;
        default:
          console.log('[generic-worker] Unknown mediaType, skipping');
      }
    } catch (err) {
      console.error('[generic-worker] Message failed', err);
      throw err; // re-queue via SQS retry
    }
  }
};

async function handleAsset(job) {
  const baseUrl = process.env.PUBLIC_API_BASE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://hh-bot-lyart.vercel.app');
  const res = await fetch(`${baseUrl}/api/media-labeling/assets/${job.assetId}`);
  if (!res.ok) throw new Error(`Asset GET failed ${res.status}`);
  const asset = await res.json();
  const isRefresh = job.stage === 'refresh';
  await ingestAsset(asset, isRefresh);
  console.log(`[generic-worker] ${isRefresh ? 'Upserted' : 'Ingested'} asset ${job.assetId}`);
}

async function handleText(job) {
  // The sync-content webhook passes sourcePath & gitRef so we can fetch raw MDX
  if (!job.sourcePath || !job.gitRef) {
    console.warn('[generic-worker] text job missing sourcePath/gitRef');
    return;
  }
  const githubRaw = `https://raw.githubusercontent.com/${process.env.GITHUB_REPO || 'starholder11/HH-Bot'}/${job.gitRef}/${job.sourcePath}`;
  const res = await fetch(githubRaw);
  if (!res.ok) throw new Error(`raw github fetch failed ${res.status}`);
  const mdx = await res.text();
  const title = job.title || job.assetId;
  const { ingestText } = require('../lib/ingestion');
  await ingestText(job.assetId, title, mdx);
  console.log(`[generic-worker] Ingested text ${job.assetId}`);
}
