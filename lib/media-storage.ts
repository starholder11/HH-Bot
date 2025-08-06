import { ListObjectsV2Command, ListObjectsV2CommandOutput, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { getS3Client, getBucketName } from './s3-config';
import { listSongs } from './song-storage'; // Import existing audio functionality

// -----------------------------------------------------------------------------
// Simple in-memory cache to avoid listing the same S3 bucket over and over.
// A single dev-server instance can receive dozens of /assets?page=1 requests in
// quick succession (Fast-Refresh, React state churn, etc.). Listing objects is
// the slowest part (2-4 s). We therefore cache the list of JSON keys for a
// short period (default 60 seconds). In production (serverless) this helps too
// because each warm Lambda invocation can reuse the cached list.
// -----------------------------------------------------------------------------

interface S3KeysCache {
  keys: string[];
  fetchedAt: number; // epoch ms
}

// Module-level variable – unique per process
let s3KeysCache: S3KeysCache | null = null;

/**
 * Clear the S3 keys cache to force fresh data on next request
 * Call this after uploads/modifications to ensure immediate visibility
 */
export function clearS3KeysCache(): void {
  console.log('[media-storage] Clearing S3 keys cache and parsed assets cache');
  s3KeysCache = null;
  parsedAssetsCache = null; // Also clear parsed assets cache
  keyframesCache = null; // Also clear keyframes cache
}

/**
 * Get cache status for debugging
 */
export function getCacheStatus() {
  const now = Date.now();
  return {
    s3KeysCache: s3KeysCache ? {
      age: Math.round((now - s3KeysCache.fetchedAt) / 1000),
      keyCount: s3KeysCache.keys.length,
      fresh: (now - s3KeysCache.fetchedAt) < S3_LIST_CACHE_TTL
    } : null,
    parsedAssetsCache: parsedAssetsCache ? {
      age: Math.round((now - parsedAssetsCache.fetchedAt) / 1000),
      assetCount: parsedAssetsCache.assets.length
    } : null,
    keyframesCache: keyframesCache ? {
      age: Math.round((now - keyframesCache.fetchedAt) / 1000),
      keyframeCount: keyframesCache.keyframes.length
    } : null
  };
}

// How long to keep the cache alive (ms). Override via env if needed.
// Use shorter cache in development for better testing experience
const S3_LIST_CACHE_TTL = process.env.S3_LIST_CACHE_TTL_MS
  ? parseInt(process.env.S3_LIST_CACHE_TTL_MS, 10)
  : (process.env.NODE_ENV === 'development' ? 10_000 : 60_000); // 10s in dev, 1 min in prod

// Prefix for media asset JSON files in S3
const PREFIX = process.env.MEDIA_DATA_PREFIX || 'media-labeling/assets/';

const isProd = process.env.NODE_ENV === 'production';
const hasBucket = !!(process.env.S3_BUCKET_NAME || process.env.AWS_S3_BUCKET);

// Cache for keyframes to avoid repeated lookups
let keyframesCache: { keyframes: KeyframeStill[], fetchedAt: number } | null = null;
const KEYFRAMES_CACHE_TTL_MS = parseInt(process.env.KEYFRAMES_CACHE_TTL_MS || '30000'); // 30 seconds

// Cache for parsed assets to avoid re-parsing JSON
interface ParsedAssetsCache {
  assets: MediaAsset[];
  fetchedAt: number;
  keys: string[]; // track which keys this cache corresponds to
}
let parsedAssetsCache: ParsedAssetsCache | null = null;
const PARSED_ASSETS_CACHE_TTL_MS = parseInt(process.env.PARSED_ASSETS_CACHE_TTL_MS || '60000'); // 1 minute

// Helper function to convert stream to string
async function streamToString(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on('error', (err) => reject(err));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });
}

// Performance optimization: limit how many assets we load by default
const DEFAULT_ASSET_LIMIT = 100;
const DEFAULT_S3_LIMIT = 1000; // Default limit for S3 listing

// Base media asset interface
export interface BaseMediaAsset {
  id: string;
  filename: string;
  s3_url: string;
  cloudflare_url: string;
  title: string;
  media_type: 'image' | 'video' | 'audio' | 'keyframe_still';
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
    ai_labeling: 'not_started' | 'triggering' | 'pending' | 'processing' | 'completed' | 'failed' | 'error';
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
  retry_count?: number;
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
    color_profile?: string;
  };
  keyframes?: {
    timestamp: string;
    s3_url: string;
    cloudflare_url: string;
    ai_labels: any;
  }[];
  keyframe_stills?: KeyframeStill[];
  keyframe_count?: number;
  ai_labels: {
    scenes: string[];
    objects: string[];
    style: string[];
    mood: string[];
    themes: string[];
    confidence_scores: Record<string, number[]>;
    overall_analysis?: any;
    keyframe_analysis?: any[];
    analysis_metadata?: any;
  };
  processing_status: {
    upload: 'pending' | 'completed' | 'error';
    metadata_extraction: 'pending' | 'completed' | 'error';
    ai_labeling: 'not_started' | 'triggering' | 'pending' | 'processing' | 'completed' | 'failed' | 'error';
    manual_review: 'pending' | 'completed' | 'error';
    keyframe_extraction?: 'pending' | 'processing' | 'completed' | 'error';
  };
  timestamps: {
    uploaded: string;
    metadata_extracted: string | null;
    labeled_ai: string | null;
    labeled_reviewed: string | null;
    keyframes_extracted?: string | null;
  };
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

export interface KeyframeAsset extends BaseMediaAsset {
  media_type: 'keyframe_still';
  parent_video_id: string;
  timestamp: string;
  frame_number: number;
  source_info?: {
    video_filename: string;
    timestamp: string;
    frame_number: number;
    extraction_method: string;
  };
  _keyframe_metadata?: {
    source_video: string;
    frame_number: number;
    timestamp: string;
  };
}

export type MediaAsset = ImageAsset | VideoAsset | AudioAsset | KeyframeAsset;


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

// Helper function to match media types, including logical groupings
function isMediaTypeMatch(asset: MediaAsset, targetType: string): boolean {
  // Direct match
  if (asset.media_type === targetType) {
    return true;
  }

  return false;
}

/**
 * List all media assets, optionally filtered by type
 */
export async function listMediaAssets(
  mediaType?: 'image' | 'video' | 'audio',
  options?: {
    page?: number;
    limit?: number;
    loadAll?: boolean; // For when we want all assets (like for search)
    excludeKeyframes?: boolean; // NEW: skip keyframe_still assets entirely
  }
): Promise<{ assets: MediaAsset[], totalCount: number, hasMore: boolean }> {
  const page = options?.page || 1;
  const limit = options?.limit || DEFAULT_ASSET_LIMIT;
  const loadAll = options?.loadAll || false;
  const excludeKeyframes = options?.excludeKeyframes || false;

  console.log(`[media-storage] Loading assets with mediaType filter: ${mediaType || 'all'}, page: ${page}, limit: ${limit}, loadAll: ${loadAll}, excludeKeyframes: ${excludeKeyframes}`);
  const startTime = Date.now();

  try {
    if (hasBucket) {
      // S3 is configured: Fetch directly from S3 efficiently
      const s3 = getS3Client();
      const bucket = getBucketName();

      let allKeys: string[];

      const now = Date.now();

            // In production serverless, disable S3 cache for asset listing to ensure fresh uploads appear
      // Each function invocation can't share cache with upload functions anyway
      const shouldUseCache = !isProd && s3KeysCache && now - s3KeysCache.fetchedAt < S3_LIST_CACHE_TTL;

      // Return cached keys if still fresh (dev only)
      if (shouldUseCache) {
        allKeys = s3KeysCache.keys;
        console.log(`[media-storage] Using cached S3 key list (age ${(now - s3KeysCache.fetchedAt) / 1000}s, ${allKeys.length} keys)`);
      } else {
        console.log('[media-storage] Listing objects from S3 with pagination…');

        // Fetch ALL keys under the prefix, paginating beyond the 1 000-key S3 limit.
        const fetchedKeys: string[] = [];
        let continuationToken: string | undefined = undefined;

        do {
          const resp: ListObjectsV2CommandOutput = await s3.send(
            new ListObjectsV2Command({
              Bucket: bucket,
              Prefix: PREFIX,
              MaxKeys: 1000, // hard S3 page limit
              ContinuationToken: continuationToken,
            })
          );

          fetchedKeys.push(
            ...(resp.Contents || [])
              .filter(obj => obj.Key?.endsWith('.json'))
              .map(obj => obj.Key!)
          );

          continuationToken = resp.IsTruncated ? resp.NextContinuationToken : undefined;
        } while (continuationToken);

        allKeys = fetchedKeys.sort((a, b) => b.localeCompare(a)); // newest first

        // Update cache
        s3KeysCache = { keys: allKeys, fetchedAt: now };
      }

      // Optional keyframe exclusion – filter keys that live under /keyframes/ directory before anything else
      if (excludeKeyframes) {
        allKeys = allKeys.filter(k => !k.includes('/keyframes/'));
      }

      // If a mediaType filter is requested we have to apply the filter *before* pagination
      // otherwise the first N keys might not contain any assets of that type (e.g. videos)

      // Strategy:
      // 1. If loadAll = true   -> fetch up to DEFAULT_S3_LIMIT keys and filter afterwards
      // 2. If NO mediaType     -> behave exactly as before (slice, then fetch)
      // 3. If mediaType GIVEN  -> fetch keys progressively until we have at least (page * limit) matching assets

      let keys: string[] = [];

      if (!mediaType || loadAll) {
        // Previous behaviour is fine when no media type filtering is required
        if (loadAll) {
          keys = allKeys.slice(0, DEFAULT_S3_LIMIT);
        } else {
          const startIndex = (page - 1) * limit;
          const endIndex = startIndex + limit;
          keys = allKeys.slice(startIndex, endIndex);
        }
      } else {
        // mediaType filtering requested – fetch keys incrementally and stop early once we have enough matches

        const concurrency = 50;
        const desiredMatches = page * limit;
        let collectedMatches = 0;
        let startIdx = 0;

        while (collectedMatches < desiredMatches && startIdx < allKeys.length && keys.length < DEFAULT_S3_LIMIT) {
          const slice = allKeys.slice(startIdx, startIdx + concurrency);
          startIdx += concurrency;

          // Fetch slice JSON to check media_type quickly
          const batchAssets: Array<MediaAsset | null> = await Promise.all(slice.map(async key => {
            try {
              const getObjectResponse = await s3.send(
                new GetObjectCommand({
                  Bucket: bucket,
                  Key: key,
                })
              );
              if (!getObjectResponse.Body) return null;
              const jsonContent = await streamToString(getObjectResponse.Body as Readable);
              const asset = JSON.parse(jsonContent) as MediaAsset;

              if (excludeKeyframes && asset.media_type === 'keyframe_still') {
                return null;
              }

              if (!isMediaTypeMatch(asset, mediaType)) {
                return null;
              }
              return asset;
            } catch {
              return null;
            }
          }));

          const matchedKeys = slice.filter((_, idx) => batchAssets[idx]);
          keys.push(...matchedKeys);
          collectedMatches += matchedKeys.length;
        }

        if (keys.length === 0) {
          // Fallback: if nothing matched, default back to first page slice
          keys = allKeys.slice(0, limit);
        }
      }

      console.log(`[media-storage] Found ${allKeys.length} asset files${excludeKeyframes ? ' (keyframes excluded)' : ''}, fetching ${keys.length} JSON records for page ${page}`);

      // Check if we can use cached parsed assets
      let allAssets: MediaAsset[] = [];
      const keysString = keys.join(',');

      if (parsedAssetsCache &&
          now - parsedAssetsCache.fetchedAt < PARSED_ASSETS_CACHE_TTL_MS &&
          parsedAssetsCache.keys.join(',') === keysString) {
        console.log(`[media-storage] Using cached parsed assets (age ${(now - parsedAssetsCache.fetchedAt) / 1000}s, ${parsedAssetsCache.assets.length} assets)`);
        allAssets = parsedAssetsCache.assets;
      } else {
        console.log(`[media-storage] Fetching and parsing ${keys.length} JSON files from S3`);
        // Fetch JSON content directly with higher concurrency
        const concurrency = 50;

      for (let i = 0; i < keys.length; i += concurrency) {
        const slice = keys.slice(i, i + concurrency);
        const batch = await Promise.all(slice.map(async key => {
          try {
            const getObjectResponse = await s3.send(new GetObjectCommand({
              Bucket: bucket,
              Key: key,
            }));

            if (!getObjectResponse.Body) return null;

            const jsonContent = await streamToString(getObjectResponse.Body as Readable);
            const asset = JSON.parse(jsonContent) as MediaAsset;

            // Apply media type filter here to avoid unnecessary processing
            if (mediaType && !isMediaTypeMatch(asset, mediaType)) {
              return null;
            }

            return asset;
          } catch (error) {
            console.warn(`[media-storage] Failed to fetch asset ${key}:`, error);
            return null;
          }
        }));

        batch.forEach(asset => {
          if (asset) allAssets.push(asset);
        });
      }

        // Sort by creation date (newest first)
        allAssets.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        // Final safety filter: drop any keyframe assets if excludeKeyframes is true
        if (excludeKeyframes) {
          allAssets = allAssets.filter(a => a.media_type !== 'keyframe_still');
        }

        // Update parsed assets cache
        parsedAssetsCache = {
          assets: allAssets,
          fetchedAt: now,
          keys: keys
        };
      }

      // At this point allAssets *may* contain more than one page worth when mediaType filter is used.
      const filteredTotalCount = allAssets.length;

      let resultAssets: MediaAsset[];
      if (loadAll) {
        resultAssets = allAssets;
      } else {
        const start = (page - 1) * limit;
        const end = start + limit;
        resultAssets = allAssets.slice(start, end);
      }

      // Re-compute hasMore after optional keyframe exclusion
      const endIndexEvaluated = page * limit;
      const totalAfterFilter = allKeys.length;
      const hasMore = endIndexEvaluated < totalAfterFilter;

      const elapsed = Date.now() - startTime;
      console.log(`[media-storage] S3 loading completed in ${elapsed}ms: returned ${resultAssets.length} assets (page ${page}) out of ${filteredTotalCount} matching (mediaType=${mediaType || 'all'})`);

      return {
        assets: resultAssets,
        totalCount: filteredTotalCount,
        hasMore
      };
    } else {
      // Development: Read from local files efficiently
      console.log('[media-storage] Loading from local files...');
      const dataDir = path.join(process.cwd(), 'media-sources', 'assets');

      try {
        const files = await fs.readdir(dataDir);
        const jsonFiles = files
          .filter(file => file.endsWith('.json'))
          .sort((a, b) => b.localeCompare(a)) // Most recent first
          .slice(0, DEFAULT_ASSET_LIMIT);

        console.log(`[media-storage] Found ${jsonFiles.length} local asset files`);

        const allAssets: MediaAsset[] = [];

        for (const file of jsonFiles) {
          try {
            const filePath = path.join(dataDir, file);
            const content = await fs.readFile(filePath, 'utf-8');
            const asset = JSON.parse(content) as MediaAsset;

            // Apply media type filter
            if (mediaType && !isMediaTypeMatch(asset, mediaType)) {
              continue;
            }

            // Apply keyframe exclusion filter
            if (excludeKeyframes && asset.media_type === 'keyframe_still') {
              continue;
            }

            allAssets.push(asset);
          } catch (error) {
            console.warn(`[media-storage] Failed to read local asset ${file}:`, error);
          }
        }

        // Sort by creation date (newest first)
        allAssets.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        const elapsed = Date.now() - startTime;
        console.log(`[media-storage] Local loading completed in ${elapsed}ms: ${allAssets.length} assets (filtered by ${mediaType || 'none'})`);

        return {
          assets: allAssets,
          totalCount: allAssets.length,
          hasMore: false // Local loading doesn't support pagination
        };
      } catch (error) {
        console.warn('[media-storage] Failed to read local assets directory:', error);
        return {
          assets: [],
          totalCount: 0,
          hasMore: false
        };
      }
    }
  } catch (error) {
    console.error('[media-storage] Error loading media assets:', error);
    return {
      assets: [],
      totalCount: 0,
      hasMore: false
    };
  }
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
  const result = await listMediaAssets(mediaType, { loadAll: true }); // Load all for search
  const lowerQuery = query.toLowerCase();

  return result.assets.filter(asset => {
    // Standard search fields with safe navigation
    const standardMatch =
      asset.title.toLowerCase().includes(lowerQuery) ||
      asset.filename.toLowerCase().includes(lowerQuery) ||
      (asset.manual_labels?.custom_tags || []).some(tag => tag.toLowerCase().includes(lowerQuery)) ||
      (asset.manual_labels?.scenes || []).some(scene => scene.toLowerCase().includes(lowerQuery)) ||
      (asset.manual_labels?.objects || []).some(obj => obj.toLowerCase().includes(lowerQuery)) ||
      (asset.manual_labels?.themes || []).some(theme => theme.toLowerCase().includes(lowerQuery)) ||
      (asset.manual_labels?.style || []).some(style => style.toLowerCase().includes(lowerQuery)) ||
      (asset.manual_labels?.mood || []).some(mood => mood.toLowerCase().includes(lowerQuery));

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
  const result = await listMediaAssets(undefined, { loadAll: true });
  return result.assets.filter(asset => asset.project_id === projectId);
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
  const result = await listMediaAssets(undefined, { loadAll: true });
  const allAssets = result.assets;
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

// Video-specific additional types

export interface KeyframeStill {
  id: string;
  parent_video_id: string;
  project_id: string | null;
  media_type: 'keyframe_still';
  timestamp: string;
  frame_number: number;
  filename: string;
  title: string;
  s3_url: string;
  cloudflare_url: string;
  reusable_as_image: boolean;
  source_info: {
    video_filename: string;
    timestamp: string;
    frame_number: number;
    extraction_method: string;
  };
  metadata: {
    file_size: number;
    format: string;
    resolution: { width: number; height: number };
    aspect_ratio: string;
    color_profile: string;
    quality: number;
  };
  ai_labels?: {
    scenes: string[];
    objects: string[];
    style: string[];
    mood: string[];
    themes: string[];
    confidence_scores: Record<string, number[]>;
  };
  usage_tracking: {
    times_reused: number;
    projects_used_in: string[];
    last_used: string | null;
  };
  processing_status: {
    extraction: 'pending' | 'processing' | 'completed' | 'error';
    ai_labeling: 'not_started' | 'triggering' | 'pending' | 'processing' | 'completed' | 'failed' | 'error';
    manual_review: 'pending' | 'completed' | 'error';
  };
  timestamps: {
    extracted: string;
    labeled_ai: string | null;
    labeled_reviewed: string | null;
  };
  labeling_complete: boolean;
  retry_count?: number;
}

/**
 * Get a video asset by ID
 */
export async function getVideoAsset(videoId: string): Promise<VideoAsset | null> {
  const asset = await getMediaAsset(videoId);
  if (!asset || asset.media_type !== 'video') {
    return null;
  }
  return asset as VideoAsset;
}

/**
 * Update a video asset with new data
 */
export async function updateVideoAsset(videoId: string, updates: Partial<VideoAsset>): Promise<VideoAsset> {
  const currentAsset = await getVideoAsset(videoId);
  if (!currentAsset) {
    throw new Error(`Video asset not found: ${videoId}`);
  }

  const updatedAsset = {
    ...currentAsset,
    ...updates,
    updated_at: new Date().toISOString()
  };

  await saveMediaAsset(videoId, updatedAsset);
  return updatedAsset;
}

/**
 * Save a keyframe still as a separate asset
 */
export async function saveKeyframeAsset(keyframe: KeyframeStill): Promise<void> {
  const s3Client = getS3Client();
  const bucketName = getBucketName();

  try {
    // Save keyframe data as JSON in dedicated keyframes folder
    const keyframeKey = `${PREFIX}keyframes/${keyframe.id}.json`;

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: keyframeKey,
      Body: JSON.stringify(keyframe, null, 2),
      ContentType: 'application/json',
    });

    await s3Client.send(command);
    console.log(`Keyframe asset saved: ${keyframeKey}`);

  } catch (error) {
    console.error('Error saving keyframe asset:', error);

    if (!isProd || !hasBucket) {
      console.log('Falling back to local storage for keyframe');
      // In development or when S3 is not available, save locally
      const localDir = path.join(process.cwd(), 'local-storage', 'keyframes');
      await fs.mkdir(localDir, { recursive: true });
      const localPath = path.join(localDir, `${keyframe.id}.json`);
      await fs.writeFile(localPath, JSON.stringify(keyframe, null, 2));
      console.log(`Keyframe saved locally: ${localPath}`);
    } else {
      throw error;
    }
  }
}

/**
 * Get a keyframe asset by ID
 */
export async function getKeyframeAsset(keyframeId: string): Promise<KeyframeStill | null> {
  const s3Client = getS3Client();
  const bucketName = getBucketName();

  try {
    const keyframeKey = `${PREFIX}keyframes/${keyframeId}.json`;

    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: keyframeKey,
    });

    const response = await s3Client.send(command);

    if (!response.Body) {
      return null;
    }

    const bodyString = await streamToString(response.Body as Readable);
    return JSON.parse(bodyString) as KeyframeStill;

  } catch (error) {
    console.warn(`Keyframe not found in S3: ${keyframeId}`, error);

    if (!isProd || !hasBucket) {
      // Try local storage
      try {
        const localPath = path.join(process.cwd(), 'local-storage', 'keyframes', `${keyframeId}.json`);
        const data = await fs.readFile(localPath, 'utf-8');
        return JSON.parse(data) as KeyframeStill;
      } catch (localError) {
        console.warn(`Keyframe not found locally: ${keyframeId}`);
      }
    }

    return null;
  }
}

/**
 * Update keyframe usage tracking
 */
export async function updateKeyframeUsage(keyframeId: string, usageData: KeyframeStill['usage_tracking']): Promise<void> {
  const keyframe = await getKeyframeAsset(keyframeId);
  if (!keyframe) {
    throw new Error(`Keyframe not found: ${keyframeId}`);
  }

  keyframe.usage_tracking = usageData;
  await saveKeyframeAsset(keyframe);
}

/**
 * Get all keyframes for a video
 */
export async function getVideoKeyframes(videoId: string): Promise<KeyframeStill[]> {
  const s3Client = getS3Client();
  const bucketName = getBucketName();

  try {
    const command = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: `${PREFIX}keyframes/`,
    });

    const response = await s3Client.send(command);

    if (!response.Contents) {
      return [];
    }

    const keyframes: KeyframeStill[] = [];

    for (const item of response.Contents) {
      if (!item.Key || !item.Key.endsWith('.json')) continue;

      try {
        const keyframeData = await getKeyframeAsset(
          path.basename(item.Key, '.json')
        );

        if (keyframeData && keyframeData.parent_video_id === videoId) {
          keyframes.push(keyframeData);
        }
      } catch (error) {
        console.warn(`Failed to load keyframe ${item.Key}:`, error);
      }
    }

    return keyframes.sort((a, b) => a.frame_number - b.frame_number);

  } catch (error) {
    console.error('Error listing video keyframes:', error);
    return [];
  }
}

/**
 * Get all keyframes across all projects and videos
 */
export async function getAllKeyframes(): Promise<KeyframeStill[]> {
  // Check cache first
  if (keyframesCache && (Date.now() - keyframesCache.fetchedAt < KEYFRAMES_CACHE_TTL_MS)) {
    console.log(`[media-storage] Using cached keyframes (age ${Math.round((Date.now() - keyframesCache.fetchedAt) / 1000)}s, ${keyframesCache.keyframes.length} keyframes)`);
    return keyframesCache.keyframes;
  }

  console.log('[media-storage] Loading keyframes...');
  const startTime = Date.now();

  try {
    // First, ensure we have the S3 key list cached
    const allKeys = await getCachedS3Keys();

    // Filter for keyframe JSON files
    const keyframeKeys = allKeys.filter(key =>
      key.startsWith(`${PREFIX}keyframes/`) && key.endsWith('.json')
    );

    console.log(`[media-storage] Found ${keyframeKeys.length} keyframe files`);

    if (keyframeKeys.length === 0) {
      keyframesCache = { keyframes: [], fetchedAt: Date.now() };
      return [];
    }

    // Limit the number of keyframes we load for performance
    // Most UI use cases don't need more than 100 recent keyframes
    const MAX_KEYFRAMES_TO_LOAD = 100;
    const limitedKeys = keyframeKeys.slice(0, MAX_KEYFRAMES_TO_LOAD);
    console.log(`[media-storage] Loading ${limitedKeys.length} of ${keyframeKeys.length} available keyframes`);

    // Batch fetch keyframe JSON files (limit to prevent timeouts)
    const MAX_CONCURRENT_KEYFRAMES = 10; // Reduced for stability
    const keyframes: KeyframeStill[] = [];

    for (let i = 0; i < limitedKeys.length; i += MAX_CONCURRENT_KEYFRAMES) {
      const batch = limitedKeys.slice(i, i + MAX_CONCURRENT_KEYFRAMES);

      const batchPromises = batch.map(async (key) => {
        try {
          const keyframeId = path.basename(key, '.json');
          return await getKeyframeAsset(keyframeId);
        } catch (error) {
          console.warn(`Failed to load keyframe ${key}:`, error);
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      keyframes.push(...batchResults.filter(kf => kf !== null) as KeyframeStill[]);
    }

    // Sort by extraction time
    keyframes.sort((a, b) => new Date(b.timestamps.extracted).getTime() - new Date(a.timestamps.extracted).getTime());

    // Cache the results
    keyframesCache = { keyframes, fetchedAt: Date.now() };

    const duration = Date.now() - startTime;
    console.log(`[media-storage] Keyframes loaded in ${duration}ms: ${keyframes.length} keyframes`);

    return keyframes;

  } catch (error) {
    console.error('Error loading keyframes:', error);

    if (!isProd || !hasBucket) {
      // Try local storage fallback
      try {
        const localDir = path.join(process.cwd(), 'local-storage', 'keyframes');
        if (fsSync.existsSync(localDir)) {
          const files = fsSync.readdirSync(localDir);
          const keyframes: KeyframeStill[] = [];

          for (const file of files) {
            if (file.endsWith('.json')) {
              try {
                const content = fsSync.readFileSync(path.join(localDir, file), 'utf8');
                const keyframe = JSON.parse(content) as KeyframeStill;
                keyframes.push(keyframe);
              } catch (parseError) {
                console.warn(`Failed to parse local keyframe ${file}:`, parseError);
              }
            }
          }

          return keyframes.sort((a, b) => new Date(b.timestamps.extracted).getTime() - new Date(a.timestamps.extracted).getTime());
        }
      } catch (localError) {
        console.warn('Failed to load local keyframes:', localError);
      }
    }

    throw error;
  }
}

/**
 * Get all keyframes for a project (across all videos in the project)
 */
export async function getProjectKeyframes(projectId: string): Promise<KeyframeStill[]> {
  const s3Client = getS3Client();
  const bucketName = getBucketName();

  try {
    const command = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: `${PREFIX}keyframes/`,
    });

    const response = await s3Client.send(command);

    if (!response.Contents) {
      return [];
    }

    const keyframes: KeyframeStill[] = [];

    for (const item of response.Contents) {
      if (!item.Key || !item.Key.endsWith('.json')) continue;

      try {
        const keyframeData = await getKeyframeAsset(
          path.basename(item.Key, '.json')
        );

        if (keyframeData && keyframeData.project_id === projectId) {
          keyframes.push(keyframeData);
        }
      } catch (error) {
        console.warn(`Failed to load keyframe ${item.Key}:`, error);
      }
    }

    return keyframes.sort((a, b) => new Date(b.timestamps.extracted).getTime() - new Date(a.timestamps.extracted).getTime());

  } catch (error) {
    console.error('Error listing project keyframes:', error);
    return [];
  }
}

/**
 * Search for reusable keyframes across all projects
 */
export async function searchReusableKeyframes(
  query?: string,
  excludeProjectId?: string,
  filters?: {
    minQuality?: number;
    hasAiLabels?: boolean;
    resolution?: { minWidth: number; minHeight: number };
  }
): Promise<KeyframeStill[]> {
  const s3Client = getS3Client();
  const bucketName = getBucketName();

  try {
    const command = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: `${PREFIX}keyframes/`,
    });

    const response = await s3Client.send(command);

    if (!response.Contents) {
      return [];
    }

    const keyframes: KeyframeStill[] = [];

    for (const item of response.Contents) {
      if (!item.Key || !item.Key.endsWith('.json')) continue;

      try {
        const keyframeData = await getKeyframeAsset(
          path.basename(item.Key, '.json')
        );

        if (!keyframeData || !keyframeData.reusable_as_image) continue;
        if (excludeProjectId && keyframeData.project_id === excludeProjectId) continue;

        // Apply filters
        if (filters) {
          if (filters.minQuality && keyframeData.metadata.quality < filters.minQuality) continue;
          if (filters.hasAiLabels && (!keyframeData.ai_labels || !keyframeData.ai_labels.scenes.length)) continue;
          if (filters.resolution) {
            const { width, height } = keyframeData.metadata.resolution;
            if (width < filters.resolution.minWidth || height < filters.resolution.minHeight) continue;
          }
        }

        // Apply text search
        if (query) {
          const lowerQuery = query.toLowerCase();
          const matchesSearch =
            keyframeData.title.toLowerCase().includes(lowerQuery) ||
            keyframeData.source_info.video_filename.toLowerCase().includes(lowerQuery) ||
            (keyframeData.ai_labels?.scenes.some(scene => scene.toLowerCase().includes(lowerQuery))) ||
            (keyframeData.ai_labels?.objects.some(obj => obj.toLowerCase().includes(lowerQuery))) ||
            (keyframeData.ai_labels?.themes.some(theme => theme.toLowerCase().includes(lowerQuery)));

          if (!matchesSearch) continue;
        }

        keyframes.push(keyframeData);
      } catch (error) {
        console.warn(`Failed to load keyframe ${item.Key}:`, error);
      }
    }

    // Sort by usage (most reused first) and quality
    return keyframes.sort((a, b) => {
      const usageDiff = b.usage_tracking.times_reused - a.usage_tracking.times_reused;
      if (usageDiff !== 0) return usageDiff;
      return b.metadata.quality - a.metadata.quality;
    });

  } catch (error) {
    console.error('Error searching reusable keyframes:', error);
    return [];
  }
}

/**
 * Convert a keyframe to a standalone image asset for reuse
 */
export async function convertKeyframeToImageAsset(
  keyframeId: string,
  targetProjectId: string,
  newTitle?: string
): Promise<ImageAsset> {
  const keyframe = await getKeyframeAsset(keyframeId);
  if (!keyframe) {
    throw new Error(`Keyframe not found: ${keyframeId}`);
  }

  // Create new image asset based on keyframe
  const imageAsset: ImageAsset = {
    id: `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    filename: `keyframe_${keyframe.filename}`,
    s3_url: keyframe.s3_url,
    cloudflare_url: keyframe.cloudflare_url,
    title: newTitle || `${keyframe.title} (Keyframe)`,
    media_type: 'image',
    metadata: {
      width: keyframe.metadata.resolution.width,
      height: keyframe.metadata.resolution.height,
      format: keyframe.metadata.format,
      file_size: keyframe.metadata.file_size,
      color_space: keyframe.metadata.color_profile,
      aspect_ratio: keyframe.metadata.aspect_ratio,
    },
    ai_labels: keyframe.ai_labels || {
      scenes: [],
      objects: [],
      style: [],
      mood: [],
      themes: [],
      confidence_scores: {},
    },
    manual_labels: {
      scenes: [],
      objects: [],
      style: [],
      mood: [],
      themes: [],
      custom_tags: [`keyframe-from-${keyframe.source_info.video_filename}`],
    },
    processing_status: {
      upload: 'completed',
      metadata_extraction: 'completed',
      ai_labeling: keyframe.ai_labels ? 'completed' : 'pending',
      manual_review: 'pending',
    },
    timestamps: {
      uploaded: new Date().toISOString(),
      metadata_extracted: new Date().toISOString(),
      labeled_ai: keyframe.ai_labels ? new Date().toISOString() : null,
      labeled_reviewed: null,
    },
    labeling_complete: false,
    project_id: targetProjectId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Save the new image asset
  await saveMediaAsset(imageAsset.id, imageAsset);

  // Update keyframe usage tracking
  const updatedUsage = {
    times_reused: keyframe.usage_tracking.times_reused + 1,
    projects_used_in: Array.from(new Set([...keyframe.usage_tracking.projects_used_in, targetProjectId])),
    last_used: new Date().toISOString(),
  };

  await updateKeyframeUsage(keyframeId, updatedUsage);

  console.log(`Converted keyframe ${keyframeId} to image asset ${imageAsset.id} for project ${targetProjectId}`);
  return imageAsset;
}

/**
 * Get comprehensive 3-level hierarchy data for a project
 */
export interface ProjectHierarchy {
  project: {
    id: string;
    name: string;
    description?: string;
  };
  videos: Array<{
    asset: VideoAsset;
    keyframes: KeyframeStill[];
  }>;
  images: ImageAsset[];
  totalKeyframes: number;
  reusableKeyframes: number;
}

export async function getProjectHierarchy(projectId: string): Promise<ProjectHierarchy> {
  // Get all assets for the project
  const allAssets = await getAssetsByProject(projectId);

  // Separate by type
  const videos = allAssets.filter(a => a.media_type === 'video') as VideoAsset[];
  const images = allAssets.filter(a => a.media_type === 'image') as ImageAsset[];

  // Get keyframes for each video
  const videosWithKeyframes = await Promise.all(
    videos.map(async (video) => ({
      asset: video,
      keyframes: await getVideoKeyframes(video.id),
    }))
  );

  // Calculate stats
  const totalKeyframes = videosWithKeyframes.reduce((sum, v) => sum + v.keyframes.length, 0);
  const reusableKeyframes = videosWithKeyframes.reduce(
    (sum, v) => sum + v.keyframes.filter(k => k.reusable_as_image).length,
    0
  );

  return {
    project: {
      id: projectId,
      name: `Project ${projectId}`, // In real implementation, get from project store
    },
    videos: videosWithKeyframes,
    images,
    totalKeyframes,
    reusableKeyframes,
  };
}

// Helper function to get the cached S3 keys (reuse main cache)
async function getCachedS3Keys(): Promise<string[]> {
  const s3Client = getS3Client();
  const bucketName = getBucketName();

  // Check if we already have the keys cached from listMediaAssets
  if (s3KeysCache && (Date.now() - s3KeysCache.fetchedAt < S3_LIST_CACHE_TTL)) {
    return s3KeysCache.keys;
  }

  // If not cached, fetch them (this will populate the cache for listMediaAssets too)
  console.log('[media-storage] Fetching S3 key list for keyframes...');
  const command = new ListObjectsV2Command({
    Bucket: bucketName,
    Prefix: PREFIX,
    MaxKeys: 1000,
  });

  const response = await s3Client.send(command);
  const keys = (response.Contents || [])
    .filter(obj => obj.Key?.endsWith('.json'))
    .map(obj => obj.Key!)
    .sort((a, b) => b.localeCompare(a)); // newest first

  // Cache the results
  s3KeysCache = { keys, fetchedAt: Date.now() };

  return keys;
}

