import { NextResponse } from 'next/server';
import { nukeOrphanRawUploads } from '@/lib/openai-sync';

export async function POST() {
  try {
    const result = await nukeOrphanRawUploads();
    return NextResponse.json(result, { status: 200 });
  } catch (err: any) {
    console.error('nuke-orphan-raw error', err);
    return NextResponse.json({ error: err?.message || 'unknown' }, { status: 500 });
  }
}

// Convenient GET alias so it can be triggered from browser
export const GET = POST; 