import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const q = searchParams.get('q') || 'the';

    let openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return NextResponse.json({ error: 'OPENAI_API_KEY is not set' }, { status: 500 });
    }
    openaiApiKey = openaiApiKey.trim();
    if (!openaiApiKey.startsWith('sk-')) {
      return NextResponse.json({ error: 'Invalid OPENAI_API_KEY format' }, { status: 500 });
    }

    const lancedbUrl = process.env.LANCEDB_URL || process.env.LANCEDB_API_URL || 'http://localhost:8000';

    // Create an embedding for a neutral term so we can request a very large limit
    const embedResponse = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: q }),
      cache: 'no-store',
    });
    if (!embedResponse.ok) {
      const text = await embedResponse.text();
      return NextResponse.json({ error: 'OpenAI embedding failed', details: text }, { status: 502 });
    }
    const { data } = await embedResponse.json();
    const queryEmbedding = data[0].embedding;

    // Ask LanceDB for essentially all rows
    const limit = 50000;
    const searchRes = await fetch(`${lancedbUrl}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query_embedding: queryEmbedding, limit }),
      cache: 'no-store',
    });
    if (!searchRes.ok) {
      const txt = await searchRes.text();
      return NextResponse.json({ error: 'LanceDB search failed', status: searchRes.status, details: txt, lancedbUrlResolved: lancedbUrl }, { status: 502 });
    }

    const rows: any[] = await searchRes.json();
    let total = 0;
    let textRows = 0;
    const uniqueTextDocs = new Set<string>();
    const countsByType: Record<string, number> = {};
    for (const r of rows) {
      total++;
      const ct = r.content_type || 'unknown';
      countsByType[ct] = (countsByType[ct] || 0) + 1;
      if (ct === 'text') {
        textRows++;
        const parent = String(r.id || '').split('#')[0] || r.id;
        uniqueTextDocs.add(parent);
      }
    }

    return NextResponse.json({
      lancedbUrlResolved: lancedbUrl,
      totalRowsReturned: total,
      countsByType,
      textRows,
      uniqueTextDocuments: uniqueTextDocs.size,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error)?.message || 'Unknown error' }, { status: 500 });
  }
}


