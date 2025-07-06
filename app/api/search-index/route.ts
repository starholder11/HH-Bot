import { generateSearchIndex } from '@/lib/search/search-index';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const index = await generateSearchIndex();
    return NextResponse.json(index, {
      headers: {
        'Cache-Control': 'public, max-age=300',
      }
    });
  } catch (error) {
    console.error('Search index generation failed:', error);
    return NextResponse.json({ entries: [] }, { status: 200 });
  }
} 