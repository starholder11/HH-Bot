import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { identifiers, preferred = 'any', userId } = await request.json();

    if (!Array.isArray(identifiers) || identifiers.length === 0) {
      return NextResponse.json({ error: 'identifiers array is required' }, { status: 400 });
    }

    const prefer = (asset: any): string | undefined => {
      const cf = asset?.cloudflare_url as string | undefined;
      const s3 = asset?.s3_url as string | undefined;
      if (preferred === 'cloudflare') return cf || s3;
      if (preferred === 's3') return s3 || cf;
      return cf || s3;
    };

    const refs: string[] = [];
    const resolved: Array<{ identifier: string; url?: string; source?: string; error?: string }> = [];

    for (const identifier of identifiers) {
      let foundUrl: string | undefined;
      
      // 1) Try direct media-labeling assets API
      try {
        const resp1 = await fetch(`${process.env.PUBLIC_API_BASE_URL || 'http://localhost:3000'}/api/media-labeling/assets/${encodeURIComponent(identifier)}`);
        if (resp1.ok) {
          const data1 = await resp1.json();
          const asset1 = data1?.asset || data1;
          foundUrl = prefer(asset1);
          if (foundUrl) {
            refs.push(foundUrl);
            resolved.push({ identifier, url: foundUrl, source: 'media-labeling/assets' });
            continue;
          }
        }
      } catch {}

      // 2) Try generic media-assets API (S3 JSON metadata)
      try {
        const resp2 = await fetch(`${process.env.PUBLIC_API_BASE_URL || 'http://localhost:3000'}/api/media-assets/${encodeURIComponent(identifier)}`);
        if (resp2.ok) {
          const data2 = await resp2.json();
          const asset2 = data2?.asset || data2;
          foundUrl = prefer(asset2);
          if (foundUrl) {
            refs.push(foundUrl);
            resolved.push({ identifier, url: foundUrl, source: 'media-assets' });
            continue;
          }
        }
      } catch {}

      // 3) Fallback unified search by name/filename
      try {
        const resp3 = await fetch(`${process.env.PUBLIC_API_BASE_URL || 'http://localhost:3000'}/api/unified-search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: identifier, limit: 5 })
        });
        if (resp3.ok) {
          const data3 = await resp3.json();
          const arr = Array.isArray(data3?.results?.all) ? data3.results.all : (Array.isArray(data3?.results) ? data3.results : []);
          const first = Array.isArray(arr) && arr.length > 0 ? arr[0] : null;
          const candidate = first?.url || first?.media_url || first?.cloudflare_url || first?.s3_url;
          if (candidate) {
            refs.push(candidate);
            resolved.push({ identifier, url: candidate, source: 'unified-search' });
            continue;
          }
        }
      } catch {}

      resolved.push({ identifier, error: 'Not found' });
    }

    console.log(`[resolveAssetRefs] Resolved ${refs.length}/${identifiers.length} assets:`, resolved);

    return NextResponse.json({
      success: true,
      refs,
      resolved,
      correlationId: `resolve_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`
    });

  } catch (error) {
    console.error('[resolveAssetRefs] Error:', error);
    return NextResponse.json(
      { error: 'Failed to resolve asset references' },
      { status: 500 }
    );
  }
}
