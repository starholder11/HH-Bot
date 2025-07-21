import { getOpenAIClient } from '@/lib/ai-labeling';
import { NextResponse } from 'next/server';
import { listAllFilesWithNames } from '@/lib/openai-sync';

const openai = getOpenAIClient();
const VECTOR_STORE_ID = 'vs_6860128217f08191bacd30e1475d8566';

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';

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

    // Bulk delete nameless files if ?nukeNameless=1
    if (searchParams.get('nukeNameless') === '1') {
      const named = await listAllFilesWithNames();
      const nameless = named.filter(f => !f.filename);
      const results = await Promise.allSettled(
        nameless.map(async f => {
          try {
            const detail: any = await openai.vectorStores.files.retrieve(VECTOR_STORE_ID, f.id);
            if (detail?.file_id) {
              // Delete underlying upload first
              await openai.files.del(detail.file_id as string);
            }
            await openai.vectorStores.files.del(VECTOR_STORE_ID, f.id);
            return { ok: true };
          } catch (err) {
            return { ok: false, err: (err as any)?.message || 'unknown' };
          }
        })
      );
      const summary = results.map((r, idx) => ({ id: nameless[idx].id, status: r.status, value: (r as any).value }));
      return NextResponse.json({ deleted: summary.length, summary }, { status: 200 });
    }

    // Probe single file if ?id=<fileId>
    const probeId = searchParams.get('id');
    if (probeId) {
      try {
        const detail = await openai.vectorStores.files.retrieve(VECTOR_STORE_ID, probeId);
        return NextResponse.json(detail, { status: 200 });
      } catch (err: any) {
        return NextResponse.json({ error: err?.message || 'unknown' }, { status: 500 });
      }
    }

    // Only return lightweight info
    const slim = files.map(f => ({ id: f.id, attrs: f.attributes, status: f.status }));
    return NextResponse.json({ count: files.length, slim }, { status: 200 });
  } catch (err: any) {
    console.error('debug-vector-files error', err);
    return NextResponse.json({ error: err?.message || 'unknown' }, { status: 500 });
  }
}
