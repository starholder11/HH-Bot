import { NextRequest, NextResponse } from 'next/server';
import { ObjectAssetZ } from '@/lib/spatial/schemas';
import { listMediaAssets, saveMediaAsset } from '@/lib/media-storage';

export async function GET(req: NextRequest) {
  try {
    const result = await listMediaAssets('object' as any, { loadAll: true });
    return NextResponse.json({ assets: result.assets, totalCount: result.totalCount });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to list objects' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = ObjectAssetZ.parse(body);
    await saveMediaAsset(parsed.id, parsed as any);
    return NextResponse.json({ ok: true, id: parsed.id });
  } catch (e: any) {
    const msg = e?.issues ? JSON.stringify(e.issues) : e?.message || 'Validation error';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}


