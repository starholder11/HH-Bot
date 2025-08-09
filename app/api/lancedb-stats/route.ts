import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type LanceRow = {
  id: string;
  content_type: string;
  title?: string;
  searchable_text?: string;
  references?: string | null;
};

export async function GET(_req: NextRequest) {
  try {
    const lancedbUrl = process.env.LANCEDB_URL || process.env.LANCEDB_API_URL || 'http://localhost:8000';

    // Try health and schema for context
    let health: string | null = null;
    let schemaText: string | null = null;
    try {
      const healthRes = await fetch(`${lancedbUrl}/health`, { cache: 'no-store' });
      if (healthRes.ok) health = await healthRes.text();
    } catch {}
    try {
      const schemaRes = await fetch(`${lancedbUrl}/debug/schema`, { cache: 'no-store' });
      if (schemaRes.ok) schemaText = await schemaRes.text();
    } catch {}

    // Try count endpoint first (fast), then export-all for grouping
    let totalCount: number | null = null;
    try {
      const countRes = await fetch(`${lancedbUrl}/count`, { cache: 'no-store' });
      if (countRes.ok) {
        const json = await countRes.json().catch(() => ({} as any));
        if (typeof json.count === 'number') totalCount = json.count;
      }
    } catch {}

    const expRes = await fetch(`${lancedbUrl}/export-all`, { cache: 'no-store' });
    if (!expRes.ok) {
      const text = await expRes.text();
      return NextResponse.json({ error: 'export-all failed', status: expRes.status, details: text, lancedbUrlResolved: lancedbUrl, health, schemaText, totalCount }, { status: 502 });
    }
    const rows = (await expRes.json()) as LanceRow[];

    const mediaTypes = new Set(['video', 'image', 'audio']);
    let textRows = 0;
    let mediaRows = 0;
    const byType: Record<string, number> = {};

    for (const r of rows) {
      const ct = r.content_type || 'unknown';
      byType[ct] = (byType[ct] || 0) + 1;
      if (ct === 'text') textRows += 1;
      else if (mediaTypes.has(ct)) mediaRows += 1;
    }

    // Document-level unique text count (collapse chunk ids of form doc#chunk)
    const uniqueTextDocs = new Set<string>();
    for (const r of rows) {
      if (r.content_type === 'text') {
        const parent = (r.id || '').split('#')[0] || r.id;
        uniqueTextDocs.add(parent);
      }
    }

    return NextResponse.json({
      lancedbUrlResolved: lancedbUrl,
      health,
      schemaText,
      totalRows: totalCount ?? rows.length,
      totalRowsFromExport: rows.length,
      countsByType: byType,
      textRows,
      uniqueTextDocuments: uniqueTextDocs.size,
      mediaRows,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error)?.message || 'Unknown error' }, { status: 500 });
  }
}


