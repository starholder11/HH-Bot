import { NextRequest, NextResponse } from 'next/server';
import { getMediaAsset, updateMediaAsset, deleteMediaAsset } from '@/lib/media-storage';
import { ObjectCollectionZ } from '@/lib/spatial/schemas';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const asset = await getMediaAsset(params.id);
    if (!asset || asset.media_type !== 'object_collection') {
      return NextResponse.json({ error: 'Object collection not found' }, { status: 404 });
    }
    return NextResponse.json(asset);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to fetch object collection' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const parsed = ObjectCollectionZ.parse({ ...body, id: params.id });
    const updated = await updateMediaAsset(params.id, parsed as any);
    if (!updated) return NextResponse.json({ error: 'Object collection not found' }, { status: 404 });
    return NextResponse.json(updated);
  } catch (e: any) {
    const msg = e?.issues ? JSON.stringify(e.issues) : e?.message || 'Validation error';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ok = await deleteMediaAsset(params.id);
    if (!ok) return NextResponse.json({ error: 'Object collection not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to delete object collection' }, { status: 500 });
  }
}


