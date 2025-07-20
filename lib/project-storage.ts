import { ListObjectsV2Command, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs/promises';
import path from 'path';
import { Readable } from 'stream';
import { getS3Client, getBucketName } from './s3-config';
import { v4 as uuidv4 } from 'uuid';

// Prefix for project JSON files in S3
const PREFIX = process.env.PROJECT_DATA_PREFIX || 'media-labeling/projects/';

const isProd = process.env.NODE_ENV === 'production';
const hasBucket = !!(process.env.S3_BUCKET_NAME || process.env.AWS_S3_BUCKET);

// Project interface definition
export interface Project {
  project_id: string;
  name: string;
  description?: string;
  media_assets: string[]; // Array of media asset IDs
  created_at: string;
  updated_at: string;
  asset_counts: {
    images: number;
    videos: number;
    audio: number;
    total: number;
  };
  tags?: string[];
  status: 'active' | 'archived' | 'draft';
}

function streamToString(stream: Readable): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', chunk => chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk));
    stream.on('error', err => reject(err));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });
}

/**
 * List all projects, sorted by creation date (newest first)
 */
export async function listProjects(): Promise<Project[]> {
  if (hasBucket) {
    try {
      const s3 = getS3Client();
      const bucket = getBucketName();
      const objects = await s3.send(
        new ListObjectsV2Command({ Bucket: bucket, Prefix: PREFIX })
      );

      if (!objects.Contents) return [];

      const projects: Project[] = [];
      const keys = objects.Contents.map(c => c.Key).filter(k => k && k.endsWith('.json')) as string[];

      // Process in batches for performance
      const concurrency = 20;
      for (let i = 0; i < keys.length; i += concurrency) {
        const slice = keys.slice(i, i + concurrency);
        const batch = await Promise.all(slice.map(async key => {
          const projectId = key.slice(PREFIX.length, -5);
          try {
            return await getProject(projectId);
          } catch {
            return null;
          }
        }));
        batch.forEach(p => { if (p) projects.push(p); });
      }

      projects.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return projects;
    } catch (err) {
      console.warn('Falling back to local project storage:', err);
    }
  }

  // Local fallback
  const dataDir = path.join(process.cwd(), 'media-sources', 'projects');
  try {
    await fs.access(dataDir);
  } catch {
    return [];
  }

  const files = await fs.readdir(dataDir);
  const jsonFiles = files.filter(f => f.endsWith('.json'));
  const projects: Project[] = [];

  for (const file of jsonFiles) {
    try {
      const content = await fs.readFile(path.join(dataDir, file), 'utf-8');
      projects.push(JSON.parse(content));
    } catch (err) {
      console.error('Error reading project file', file, err);
    }
  }

  projects.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return projects;
}

/**
 * Get a single project by ID
 */
export async function getProject(projectId: string): Promise<Project | null> {
  if (hasBucket) {
    try {
      const s3 = getS3Client();
      const bucket = getBucketName();
      const key = `${PREFIX}${projectId}.json`;
      const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const body = await streamToString(obj.Body as Readable);
      return JSON.parse(body);
    } catch (err: any) {
      console.warn('getProject: S3 fetch failed, falling back to local', err?.name || err);
    }
  }

  // Local fallback
  const filePath = path.join(process.cwd(), 'media-sources', 'projects', `${projectId}.json`);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (err: any) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * Save a project (create or update)
 */
export async function saveProject(projectId: string, projectData: Project): Promise<void> {
  if (hasBucket) {
    try {
      const s3 = getS3Client();
      const bucket = getBucketName();
      const key = `${PREFIX}${projectId}.json`;
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: JSON.stringify(projectData, null, 2),
          ContentType: 'application/json',
          CacheControl: 'max-age=31536000',
        })
      );
      return;
    } catch (err) {
      console.error('saveProject: S3 write failed', err);
      if (isProd) {
        throw err;
      }
      console.warn('saveProject: falling back to local file write');
    }
  }

  // Local fallback
  const dataDir = path.join(process.cwd(), 'media-sources', 'projects');
  try {
    await fs.mkdir(dataDir, { recursive: true });
  } catch {}
  await fs.writeFile(path.join(dataDir, `${projectId}.json`), JSON.stringify(projectData, null, 2));
}

/**
 * Create a new project
 */
export async function createProject(data: {
  name: string;
  description?: string;
  tags?: string[];
}): Promise<Project> {
  const projectId = uuidv4();
  const now = new Date().toISOString();

  const project: Project = {
    project_id: projectId,
    name: data.name,
    description: data.description || '',
    media_assets: [],
    created_at: now,
    updated_at: now,
    asset_counts: {
      images: 0,
      videos: 0,
      audio: 0,
      total: 0
    },
    tags: data.tags || [],
    status: 'active'
  };

  await saveProject(projectId, project);
  return project;
}

/**
 * Update an existing project
 */
export async function updateProject(
  projectId: string,
  updates: Partial<Omit<Project, 'project_id' | 'created_at'>>
): Promise<Project | null> {
  const existingProject = await getProject(projectId);
  if (!existingProject) return null;

  const updatedProject: Project = {
    ...existingProject,
    ...updates,
    project_id: projectId, // Ensure ID doesn't change
    created_at: existingProject.created_at, // Ensure created_at doesn't change
    updated_at: new Date().toISOString()
  };

  await saveProject(projectId, updatedProject);
  return updatedProject;
}

/**
 * Delete a project
 */
export async function deleteProject(projectId: string): Promise<boolean> {
  const existingProject = await getProject(projectId);
  if (!existingProject) return false;

  if (hasBucket) {
    try {
      const s3 = getS3Client();
      const bucket = getBucketName();
      const key = `${PREFIX}${projectId}.json`;
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      return true;
    } catch (err) {
      console.error('deleteProject: S3 delete failed', err);
      if (isProd) {
        throw err;
      }
      console.warn('deleteProject: falling back to local file delete');
    }
  }

  // Local fallback
  const filePath = path.join(process.cwd(), 'media-sources', 'projects', `${projectId}.json`);
  try {
    await fs.unlink(filePath);
    return true;
  } catch (err: any) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
}

/**
 * Add a media asset to a project
 */
export async function addAssetToProject(
  projectId: string,
  assetId: string,
  mediaType: 'image' | 'video' | 'audio'
): Promise<Project | null> {
  const project = await getProject(projectId);
  if (!project) return null;

  // Add asset ID if not already present
  if (!project.media_assets.includes(assetId)) {
    project.media_assets.push(assetId);

    // Map singular media types to plural property names
    const countKey = mediaType === 'image' ? 'images' :
                     mediaType === 'video' ? 'videos' : 'audio';
    project.asset_counts[countKey]++;
    project.asset_counts.total++;
    project.updated_at = new Date().toISOString();

    await saveProject(projectId, project);
  }

  return project;
}

/**
 * Remove a media asset from a project
 */
export async function removeAssetFromProject(
  projectId: string,
  assetId: string,
  mediaType: 'image' | 'video' | 'audio'
): Promise<Project | null> {
  const project = await getProject(projectId);
  if (!project) return null;

  const assetIndex = project.media_assets.indexOf(assetId);
  if (assetIndex > -1) {
    project.media_assets.splice(assetIndex, 1);

    // Map singular media types to plural property names
    const countKey = mediaType === 'image' ? 'images' :
                     mediaType === 'video' ? 'videos' : 'audio';
    project.asset_counts[countKey] = Math.max(0, project.asset_counts[countKey] - 1);
    project.asset_counts.total = Math.max(0, project.asset_counts.total - 1);
    project.updated_at = new Date().toISOString();

    await saveProject(projectId, project);
  }

  return project;
}

/**
 * Get projects that contain a specific asset
 */
export async function getProjectsContainingAsset(assetId: string): Promise<Project[]> {
  const allProjects = await listProjects();
  return allProjects.filter(project => project.media_assets.includes(assetId));
}

/**
 * Search projects by name, description, or tags
 */
export async function searchProjects(query: string): Promise<Project[]> {
  const allProjects = await listProjects();
  const lowerQuery = query.toLowerCase();

  return allProjects.filter(project =>
    project.name.toLowerCase().includes(lowerQuery) ||
    project.description?.toLowerCase().includes(lowerQuery) ||
    project.tags?.some(tag => tag.toLowerCase().includes(lowerQuery))
  );
}
