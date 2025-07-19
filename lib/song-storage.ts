import { ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs/promises';
import path from 'path';
import { Readable } from 'stream';
import { getS3Client, getBucketName } from './s3-config';

// Prefix inside the bucket where song JSON files will live.
const PREFIX = process.env.SONG_DATA_PREFIX || 'audio-labeling/data/';

const isProd = process.env.NODE_ENV === 'production';
// We attempt S3 operations whenever a bucket name is present. Credentials can
// come from env vars, shared credentials file, or IAM role. If any S3 request
// fails due to auth/problem we gracefully fall back to local files.
const hasBucket = !!process.env.S3_BUCKET_NAME;

function streamToString(stream: Readable): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', chunk => chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk));
    stream.on('error', err => reject(err));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });
}

export async function listSongs(): Promise<any[]> {
  if (hasBucket) {
    try {
      const s3 = getS3Client();
      const bucket = getBucketName();
      const objects = await s3.send(
        new ListObjectsV2Command({ Bucket: bucket, Prefix: PREFIX })
      );
      if (!objects.Contents) throw new Error('No objects');
      const songs: any[] = [];
      for (const obj of objects.Contents) {
        if (!obj.Key || !obj.Key.endsWith('.json')) continue;
        const id = obj.Key.slice(PREFIX.length, -5);
        try {
          const song = await getSong(id);
          if (song) songs.push(song);
        } catch (err) {
          console.error('Error loading song', obj.Key, err);
        }
      }
      songs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return songs;
    } catch (err) {
      console.warn('Falling back to local song storage:', err);
    }
  }

  // ===== Local fallback =====
  const dataDir = path.join(process.cwd(), 'audio-sources', 'data');
  try {
    await fs.access(dataDir);
  } catch {
    return [];
  }
  const files = await fs.readdir(dataDir);
  const jsonFiles = files.filter(f => f.endsWith('.json'));
  const songs: any[] = [];
  for (const file of jsonFiles) {
    try {
      const content = await fs.readFile(path.join(dataDir, file), 'utf-8');
      songs.push(JSON.parse(content));
    } catch (err) {
      console.error('Error reading', file, err);
    }
  }
  songs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return songs;
}

export async function getSong(id: string): Promise<any | null> {
  if (hasBucket) {
    try {
      const s3 = getS3Client();
      const bucket = getBucketName();
      const key = `${PREFIX}${id}.json`;
      const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const body = await streamToString(obj.Body as Readable);
      return JSON.parse(body);
    } catch (err: any) {
      // Log and fall back to local filesystem for ANY failure (including 404)
      console.warn('getSong: S3 fetch failed, falling back to local', err?.name || err);
    }
  }

  // Local fallback
  const filePath = path.join(process.cwd(), 'audio-sources', 'data', `${id}.json`);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (err: any) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

export async function saveSong(id: string, data: any): Promise<void> {
  if (hasBucket) {
    try {
      const s3 = getS3Client();
      const bucket = getBucketName();
      const key = `${PREFIX}${id}.json`;
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: JSON.stringify(data, null, 2),
          ContentType: 'application/json',
          CacheControl: 'max-age=31536000',
        })
      );
      return;
    } catch (err) {
      console.error('saveSong: S3 write failed', err);
      // If running in a read-only environment (e.g., Vercel), rethrow so caller returns 500
      if (isProd) {
        throw err;
      }
      console.warn('saveSong: falling back to local file write');
    }
  }

  // Local fallback
  const dataDir = path.join(process.cwd(), 'audio-sources', 'data');
  try {
    await fs.mkdir(dataDir, { recursive: true });
  } catch {}
  await fs.writeFile(path.join(dataDir, `${id}.json`), JSON.stringify(data, null, 2));
}
