import { MediaAsset } from '@/lib/media-storage';
import { getProject } from '@/lib/project-storage';
import { ParallelIngestionService } from './ParallelIngestionService';

const sharedSvc = new ParallelIngestionService();

/** Ingest or upsert one MediaAsset JSON into LanceDB */
export async function ingestAsset(asset: MediaAsset, isRefresh: boolean = false) {
  const item = ParallelIngestionService.mediaAssetToContentItem(asset);

  // Augment images with human-readable project name in searchable text
  if (asset.media_type === 'image' && asset.project_id) {
    try {
      const project = await getProject(asset.project_id);
      const projectName = project?.name?.trim();
      if (projectName) {
        item.combinedText = `Project: ${projectName}\n${item.combinedText}`;
        item.metadata = {
          ...(item.metadata || {}),
          project: { id: project?.project_id || asset.project_id, name: projectName },
        };
      } else {
        // Fallback to include project ID to aid exact-ID searches
        item.combinedText = `Project: ${asset.project_id}\n${item.combinedText}`;
        item.metadata = {
          ...(item.metadata || {}),
          project: { id: asset.project_id },
        };
      }
    } catch {
      // Non-fatal: proceed without project name if lookup fails
      item.metadata = {
        ...(item.metadata || {}),
        project: { id: asset.project_id },
      };
    }
  }

  await sharedSvc.ingestWithOptimizations([item], isRefresh);
}

/** Ingest plain text (e.g., MDX document) */
export async function ingestText(id: string, title: string, body: string, isRefresh: boolean = false) {
  await sharedSvc.ingestWithOptimizations([
    {
      id,
      title,
      content_type: 'text',
      combinedText: `${title}\n${body}`,
    },
  ], isRefresh); // Default to insert mode since text should only ingest once on create
}

export { ParallelIngestionService };
