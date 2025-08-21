import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function isAllowedUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    const host = u.hostname.toLowerCase();
    // Allow common asset hosts we control/use
    if (host.endsWith('cloudfront.net')) return true;
    if (host.includes('.s3.') && host.endsWith('amazonaws.com')) return true;
    if (host.endsWith('amazonaws.com')) return true;
    return false;
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url || !isAllowedUrl(url)) {
    return NextResponse.json({ error: 'Invalid or disallowed url' }, { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } });
  }

  try {
    const upstream = await fetch(url, { cache: 'force-cache', headers: { 'user-agent': 'HH-Bot-Proxy/1.0' } });
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: 'Upstream fetch failed', status: upstream.status }, { status: 502, headers: { 'Access-Control-Allow-Origin': '*' } });
    }
    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const res = new NextResponse(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
    return res;
  } catch (err) {
    return NextResponse.json({ error: 'Proxy error', details: (err as Error).message }, { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
  }
}


