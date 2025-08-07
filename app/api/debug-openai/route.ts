import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json();

    const apiKey = (process.env.OPENAI_API_KEY || '').replace(/\s+/g, '');
    console.log(`[debug-openai] Key length: ${apiKey.length}, starts: ${apiKey.slice(0, 7)}, ends: ${apiKey.slice(-4)}`);

    const openai = new OpenAI({ apiKey });

    // Test embeddings call
    const resp = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: [text || 'test'],
      encoding_format: 'float',
    });

    return NextResponse.json({
      success: true,
      embeddingCount: resp.data.length,
      model: resp.model,
      usage: resp.usage
    });

  } catch (error: any) {
    console.error('[debug-openai] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      status: error.status,
      code: error.code
    }, { status: 500 });
  }
}
