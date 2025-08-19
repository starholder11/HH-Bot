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
  const seenIds = new Set();
  for (const record of event.Records) {
    try {
      const msg = JSON.parse(record.body);
      console.log('[generic-worker] Processing message', msg);

      // Only process LanceDB ingestion messages, not unrelated jobs
      if (!['post_labeling_ingestion', 'refresh', 'initial'].includes(msg.stage) && msg.mediaType !== 'text') {
        console.log('[generic-worker] Skipping non-ingestion message (missing valid stage)');
        continue;
      }

      // De-dup within a single batch by assetId
      if (msg.assetId && seenIds.has(msg.assetId)) {
        console.log('[generic-worker] Skipping duplicate in batch for', msg.assetId);
        continue;
      }
      if (msg.assetId) seenIds.add(msg.assetId);

      switch (msg.mediaType) {
        case 'text':
          await handleText(msg);
          break;
        case 'image':
        case 'audio':
        case 'video':
        case 'keyframe':
        case 'keyframe_still':
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
  let asset;

  // For keyframes, fetch directly from S3 to avoid cache issues
  if (job.mediaType === 'keyframe_still' || job.mediaType === 'keyframe') {
    try {
      console.log(`[generic-worker] Fetching keyframe ${job.assetId} directly from S3...`);
      const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
      const s3Client = new S3Client({ region: 'us-east-1' });
      const s3Key = `media-labeling/assets/keyframes/${job.assetId}.json`;
      const command = new GetObjectCommand({
        Bucket: 'hh-bot-images-2025-prod',
        Key: s3Key
      });
      const s3Response = await s3Client.send(command);
      const bodyText = await s3Response.Body.transformToString();
      asset = JSON.parse(bodyText);
      console.log(`[generic-worker] ✅ Fetched keyframe from S3: ${asset.title}`);
    } catch (s3Error) {
      console.warn(`[generic-worker] S3 fetch failed for keyframe ${job.assetId}:`, s3Error.message);
      // Fallback to API
      const baseUrl = process.env.PUBLIC_API_BASE_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://hh-bot-lyart.vercel.app');
      const res = await fetch(`${baseUrl}/api/media-labeling/assets/${job.assetId}`);
      if (!res.ok) throw new Error(`Asset GET failed ${res.status}`);
      asset = await res.json();
    }
  } else {
    // For regular media assets, use API
    const baseUrl = process.env.PUBLIC_API_BASE_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://hh-bot-lyart.vercel.app');
    const res = await fetch(`${baseUrl}/api/media-labeling/assets/${job.assetId}`);
    if (!res.ok) throw new Error(`Asset GET failed ${res.status}`);
    asset = await res.json();
  }

  // Always upsert (delete-first) for any ingestion job to ensure single row per id
  // Always upsert to ensure single-row per id in LanceDB
  await ingestAsset(asset, true);
  const upsertLabel = job.stage === 'refresh' ? 'Upserted' : 'Ingested';
  console.log(`[generic-worker] ${upsertLabel} asset ${job.assetId}`);
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
