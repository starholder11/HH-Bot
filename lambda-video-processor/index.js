// Lambda worker entry – triggered by SQS events.
// For now it forwards the job back to our public analyze API route.
// This keeps changes minimal while moving the heavy work off the end-user
// upload request-lifecycle.

import fetch from 'node-fetch';

export const handler = async (event) => {
  for (const record of event.Records) {
    try {
      const job = JSON.parse(record.body);
      console.log('[worker] processing job', job);

      if (job.mediaType !== 'video') {
        console.log('[worker] skipping non-video job');
        continue;
      }

      const baseUrl = process.env.PUBLIC_API_BASE_URL ?? `https://${process.env.VERCEL_URL}`;
      const res = await fetch(`${baseUrl}/api/media-labeling/videos/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: job.assetId, strategy: job.strategy || 'adaptive' }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`analyze API returned ${res.status} – ${text}`);
      }

      console.log('[worker] analysis started OK', job.assetId);
    } catch (err) {
      console.error('[worker] job failed', err);
      throw err; // re-queue via SQS retry
    }
  }
};
