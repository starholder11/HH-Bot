import OpenAI from 'openai';
import { NextResponse } from 'next/server';
import { listAllFilesWithNames } from '@/lib/openai-sync';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const VECTOR_STORE_ID = 'vs_6860128217f08191bacd30e1475d8566';

export async function GET(req: Request) {
  try {
    // Fetch up to 100 files (first page)
    const page: any = await openai.vectorStores.files.list(VECTOR_STORE_ID, { limit: 100 } as any);
    let files: any[] = [];

    if (typeof page?.iter === 'function') {
      for await (const file of (openai.vectorStores.files.list(VECTOR_STORE_ID, { limit: 100 } as any) as any).iter()) {
        files.push(file);
        if (files.length >= 100) break;
      }
    } else {
      files = page.data || [];
    }

    // If caller requests detailed filenames use helper
    const { searchParams } = new URL(req.url);
    if (searchParams.get('detailed') === '1') {
      const named = await listAllFilesWithNames();
      return NextResponse.json({ count: named.length, named }, { status: 200 });
    }

    // Only return lightweight info
    const slim = files.map(f => ({ id: f.id, attrs: f.attributes, status: f.status }));
    return NextResponse.json({ count: files.length, slim }, { status: 200 });
  } catch (err: any) {
    console.error('debug-vector-files error', err);
    return NextResponse.json({ error: err?.message || 'unknown' }, { status: 500 });
  }
} 