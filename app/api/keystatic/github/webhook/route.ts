import { NextRequest } from 'next/server';
import { POST as syncContentHandler } from '../../../sync-content/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  console.log('🔔 GitHub webhook received at /api/keystatic/github/webhook - forwarding to sync-content');
  
  // Forward directly to the sync-content handler
  return await syncContentHandler(request);
}