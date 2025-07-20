import { ListObjectsV2Command, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs/promises';
import path from 'path';
import { Readable } from 'stream';
import { getS3Client, getBucketName } from './s3-config';
import { listSongs } from './song-storage'; // Import existing audio functionality

// Prefix for media asset JSON files in S3
const PREFIX = process.env.MEDIA_DATA_PREFIX || 'media-labeling/assets/';

const isProd = process.env.NODE_ENV === 'production';
const hasBucket = !!(process.env.S3_BUCKET_NAME || process.env.AWS_S3_BUCKET);

// Base media asset interface
export interface BaseMediaAsset {
  id: string;
  filename: string;
  s3_url: string;
  cloudflare_url: string;
  title: string;
  media_type: 'image' | 'video' | 'audio';
  metadata: any; // Type varies by media type
  ai_labels: {
    scenes: string[];
    objects: string[];
    style: string[];
    mood: string[];
    themes: string[];
    confidence_scores: Record<string, number[]>;
  };
  manual_labels: {
    scenes: string[];
    objects: string[];
    style: string[];
    mood: string[];
    themes: string[];
    custom_tags: string[];
  };
  processing_status: {
    upload: 'pending' | 'completed' | 'error';
    metadata_extraction: 'pending' | 'completed' | 'error';
    ai_labeling: 'pending' | 'completed' | 'error';
    manual_review: 'pending' | 'completed' | 'error';
  };
  timestamps: {
    uploaded: string;
    metadata_extracted: string | null;
    labeled_ai: string | null;
    labeled_reviewed: string | null;
  };
  labeling_complete: boolean;
  project_id: string | null;
  created_at: string;
  updated_at: string;
}

// Specific media types
export interface ImageAsset extends BaseMediaAsset {
  media_type: 'image';
  metadata: {
    width: number;
    height: number;
    format: string;
    file_size: number;
    color_space?: string;
    has_alpha?: boolean;
    density?: number;
    aspect_ratio: string;
  };
}

export interface VideoAsset extends BaseMediaAsset {
  media_type: 'video';
  metadata: {
    width: number;
    height: number;
    duration: number;
    format: string;
    file_size: number;
    codec?: string;
    frame_rate?: number;
    aspect_ratio: string;
    bitrate?: number;
  };
  keyframes?: {
    timestamp: string;
    s3_url: string;
    cloudflare_url: string;
    ai_labels: any;
  }[];
}

export interface AudioAsset extends BaseMediaAsset {
  media_type: 'audio';
  metadata: {
    duration: number;
    bitrate: number;
    format: string;
    file_size: number;
    artist?: string;
    album?: string;
    year?: number;
  };
  lyrics?: string;
  prompt?: string;
  cover_art?: {
    s3_url: string;
    cloudflare_url: string;
    key: string;
  };
}

export type MediaAsset = ImageAsset | VideoAsset | AudioAsset;

function streamToString(stream: Readable): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', chunk => chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk));
    stream.on('error', err => reject(err));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });
}

/**
 * Convert existing audio song to new AudioAsset format
 */
function convertSongToAudioAsset(song: any): AudioAsset {
  return {
    id: song.id,
    filename: song.filename,
    s3_url: song.s3_url,
    cloudflare_url: song.cloudflare_url,
    title: song.title,
    media_type: 'audio' as const,
    metadata: {
      duration: song.metadata?.duration || 0,
      bitrate: song.metadata?.bitrate || 0,
      format: song.metadata?.format || 'Unknown',
      file_size: song.metadata?.file_size || 0,
      artist: song.metadata?.artist,
      album: song.metadata?.album,
      year: song.metadata?.year,
    },
    ai_labels: {
      scenes: [],
      objects: [],
      style: song.auto_analysis?.enhanced_analysis?.styles || [],
      mood: song.auto_analysis?.enhanced_analysis?.mood || [],
      themes: song.auto_analysis?.enhanced_analysis?.themes || [],
      confidence_scores: {},
    },
    manual_labels: {
      scenes: [],
      objects: [],
      style: [
        ...(song.manual_labels?.styles || []),
        ...(song.manual_labels?.custom_styles || [])
      ],
      mood: [
        ...(song.manual_labels?.mood || []),
        ...(song.manual_labels?.custom_moods || [])
      ],
      themes: [
        ...(song.manual_labels?.themes || []),
        ...(song.manual_labels?.custom_themes || [])
      ],
      custom_tags: [],
    },
    processing_status: {
      upload: 'completed' as const,
      metadata_extraction: 'completed' as const,
      ai_labeling: song.auto_analysis ? 'completed' as const : 'pending' as const,
      manual_review: song.labeling_complete ? 'completed' as const : 'pending' as const,
    },
    timestamps: {
      uploaded: song.created_at,
      metadata_extracted: song.created_at,
      labeled_ai: song.auto_analysis ? song.created_at : null,
      labeled_reviewed: song.labeling_complete ? song.updated_at : null,
    },
    labeling_complete: song.labeling_complete || false,
    project_id: null, // Existing songs don't have projects yet
    created_at: song.created_at,
    updated_at: song.updated_at,
    lyrics: song.lyrics,
    prompt: song.prompt,
    cover_art: song.cover_art,
  };
}

/**
 * List all media assets, optionally filtered by type
 */
export async function listMediaAssets(mediaType?: 'image' | 'video' | 'audio'): Promise<MediaAsset[]> {
  const allAssets: MediaAsset[] = [];

  // 1. Get new multimedia assets
  if (hasBucket) {
    try {
      const s3 = getS3Client();
      const bucket = getBucketName();
      const objects = await s3.send(
        new ListObjectsV2Command({ Bucket: bucket, Prefix: PREFIX })
      );

      if (objects.Contents) {
        const keys = objects.Contents.map(c => c.Key).filter(k => k && k.endsWith('.json')) as string[];

        // Process in batches for performance
        const concurrency = 20;
        for (let i = 0; i < keys.length; i += concurrency) {
          const slice = keys.slice(i, i + concurrency);
          const batch = await Promise.all(slice.map(async key => {
            const assetId = key.slice(PREFIX.length, -5);
            try {
              return await getMediaAsset(assetId);
            } catch {
              return null;
            }
          }));
          batch.forEach(a => { if (a) allAssets.push(a); });
        }
      }
    } catch (err) {
      console.warn('Failed to load new multimedia assets:', err);
    }
  } else {
    // Local fallback for new assets
    const dataDir = path.join(process.cwd(), 'media-sources', 'assets');
    try {
      await fs.access(dataDir);
      const files = await fs.readdir(dataDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      for (const file of jsonFiles) {
        try {
          const content = await fs.readFile(path.join(dataDir, file), 'utf-8');
          const asset = JSON.parse(content);
          allAssets.push(asset);
        } catch (err) {
          console.error('Error reading media asset file', file, err);
        }
      }
    } catch {
      // Directory doesn't exist, no new assets
    }
  }

  // 2. Get existing audio files and convert them
  if (!mediaType || mediaType === 'audio') {
    try {
      const existingSongs = await listSongs();
      const audioAssets = existingSongs.map(convertSongToAudioAsset);
      allAssets.push(...audioAssets);
    } catch (err) {
      console.warn('Failed to load existing audio files:', err);
    }
  }

  // 3. Filter by media type if specified
  const filteredAssets = mediaType ? allAssets.filter(a => a.media_type === mediaType) : allAssets;

  // 4. Remove duplicates (in case a song exists in both systems)
  const uniqueAssets = filteredAssets.reduce((acc: MediaAsset[], current) => {
    const existing = acc.find(asset => asset.id === current.id);
    if (!existing) {
      acc.push(current);
    }
    return acc;
  }, []);

  // 5. Sort by creation date (newest first)
  uniqueAssets.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return uniqueAssets;
}

/**
 * Get a single media asset by ID
 */
export async function getMediaAsset(assetId: string): Promise<MediaAsset | null> {
  if (hasBucket) {
    try {
      const s3 = getS3Client();
      const bucket = getBucketName();
      const key = `${PREFIX}${assetId}.json`;
      const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const body = await streamToString(obj.Body as Readable);
      return JSON.parse(body);
    } catch (err: any) {
      console.warn('getMediaAsset: S3 fetch failed, falling back to local', err?.name || err);
    }
  }

  // Local fallback
  const filePath = path.join(process.cwd(), 'media-sources', 'assets', `${assetId}.json`);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (err: any) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * Save a media asset (create or update)
 */
export async function saveMediaAsset(assetId: string, assetData: MediaAsset): Promise<void> {
  if (hasBucket) {
    try {
      const s3 = getS3Client();
      const bucket = getBucketName();
      const key = `${PREFIX}${assetId}.json`;
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: JSON.stringify(assetData, null, 2),
          ContentType: 'application/json',
          CacheControl: 'max-age=31536000',
        })
      );
      return;
    } catch (err) {
      console.error('saveMediaAsset: S3 write failed', err);
      if (isProd) {
        throw err;
      }
      console.warn('saveMediaAsset: falling back to local file write');
    }
  }

  // Local fallback
  const dataDir = path.join(process.cwd(), 'media-sources', 'assets');
  try {
    await fs.mkdir(dataDir, { recursive: true });
  } catch {}
  await fs.writeFile(path.join(dataDir, `${assetId}.json`), JSON.stringify(assetData, null, 2));
}

/**
 * Update an existing media asset
 */
export async function updateMediaAsset(
  assetId: string,
  updates: Partial<Omit<MediaAsset, 'id' | 'created_at'>>
): Promise<MediaAsset | null> {
  const existingAsset = await getMediaAsset(assetId);
  if (!existingAsset) return null;

  const updatedAsset = {
    ...existingAsset,
    ...updates,
    id: assetId, // Ensure ID doesn't change
    created_at: existingAsset.created_at, // Ensure created_at doesn't change
    updated_at: new Date().toISOString()
  } as MediaAsset;

  await saveMediaAsset(assetId, updatedAsset);
  return updatedAsset;
}

/**
 * Delete a media asset
 */
export async function deleteMediaAsset(assetId: string): Promise<boolean> {
  const existingAsset = await getMediaAsset(assetId);
  if (!existingAsset) return false;

  if (hasBucket) {
    try {
      const s3 = getS3Client();
      const bucket = getBucketName();
      const key = `${PREFIX}${assetId}.json`;
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      return true;
    } catch (err) {
      console.error('deleteMediaAsset: S3 delete failed', err);
      if (isProd) {
        throw err;
      }
      console.warn('deleteMediaAsset: falling back to local file delete');
    }
  }

  // Local fallback
  const filePath = path.join(process.cwd(), 'media-sources', 'assets', `${assetId}.json`);
  try {
    await fs.unlink(filePath);
    return true;
  } catch (err: any) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
}

/**
 * Search media assets by title, filename, or tags
 */
export async function searchMediaAssets(
  query: string,
  mediaType?: 'image' | 'video' | 'audio'
): Promise<MediaAsset[]> {
  const allAssets = await listMediaAssets(mediaType);
  const lowerQuery = query.toLowerCase();

  return allAssets.filter(asset => {
    // Standard search fields
    const standardMatch =
      asset.title.toLowerCase().includes(lowerQuery) ||
      asset.filename.toLowerCase().includes(lowerQuery) ||
      asset.manual_labels.custom_tags.some(tag => tag.toLowerCase().includes(lowerQuery)) ||
      asset.manual_labels.scenes.some(scene => scene.toLowerCase().includes(lowerQuery)) ||
      asset.manual_labels.objects.some(obj => obj.toLowerCase().includes(lowerQuery)) ||
      asset.manual_labels.themes.some(theme => theme.toLowerCase().includes(lowerQuery)) ||
      asset.manual_labels.style.some(style => style.toLowerCase().includes(lowerQuery)) ||
      asset.manual_labels.mood.some(mood => mood.toLowerCase().includes(lowerQuery));

    // Audio-specific search fields
    if (asset.media_type === 'audio') {
      const audioAsset = asset as AudioAsset;
      const audioMatch =
        (audioAsset.lyrics && audioAsset.lyrics.toLowerCase().includes(lowerQuery)) ||
        (audioAsset.prompt && audioAsset.prompt.toLowerCase().includes(lowerQuery)) ||
        (audioAsset.metadata.artist && audioAsset.metadata.artist.toLowerCase().includes(lowerQuery)) ||
        (audioAsset.metadata.album && audioAsset.metadata.album.toLowerCase().includes(lowerQuery));

      return standardMatch || audioMatch;
    }

    return standardMatch;
  });
}

/**
 * Get assets by project ID
 */
export async function getAssetsByProject(projectId: string): Promise<MediaAsset[]> {
  const allAssets = await listMediaAssets();
  return allAssets.filter(asset => asset.project_id === projectId);
}

/**
 * Get asset statistics
 */
export async function getAssetStatistics(): Promise<{
  total: number;
  by_type: Record<string, number>;
  by_status: Record<string, number>;
  recent_uploads: number; // Last 24 hours
}> {
  const allAssets = await listMediaAssets();
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const stats = {
    total: allAssets.length,
    by_type: {} as Record<string, number>,
    by_status: {} as Record<string, number>,
    recent_uploads: 0
  };

  for (const asset of allAssets) {
    // Count by type
    stats.by_type[asset.media_type] = (stats.by_type[asset.media_type] || 0) + 1;

    // Count by labeling status
    const status = asset.labeling_complete ? 'completed' : 'pending';
    stats.by_status[status] = (stats.by_status[status] || 0) + 1;

    // Count recent uploads
    if (new Date(asset.created_at) > yesterday) {
      stats.recent_uploads++;
    }
  }

  return stats;
}

