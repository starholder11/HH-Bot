import { NextRequest, NextResponse } from 'next/server';
import { getMediaAsset } from '@/lib/media-storage';
import { ingestAsset } from '@/lib/ingestion';

export async function POST(req: NextRequest) {
  try {
    const { id, upsert } = await req.json();
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const asset = await getMediaAsset(id);
    if (!asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    await ingestAsset(asset as any, !!upsert);
    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error('[ingest/asset] error', error);
    return NextResponse.json({ error: 'Ingestion failed' }, { status: 500 });
  }
}
