import { MediaAsset } from '@/lib/media-storage';
import { ParallelIngestionService } from './ParallelIngestionService';

const sharedSvc = new ParallelIngestionService();

/** Ingest or upsert one MediaAsset JSON into LanceDB */
export async function ingestAsset(asset: MediaAsset, isRefresh: boolean = false) {
  await sharedSvc.ingestWithOptimizations([
    ParallelIngestionService.mediaAssetToContentItem(asset),
  ], isRefresh);
}

/** Ingest plain text (e.g., MDX document) */
export async function ingestText(id: string, title: string, body: string, isRefresh: boolean = true) {
  await sharedSvc.ingestWithOptimizations([
    {
      id,
      title,
      content_type: 'text',
      combinedText: `${title}\n${body}`,
    },
  ], isRefresh); // Pass isRefresh to enable upsert behavior
}

export { ParallelIngestionService };
