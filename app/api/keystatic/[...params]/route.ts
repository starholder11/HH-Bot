import { makeRouteHandler } from '@keystatic/next/route-handler';
import config from '../../../../keystatic.config';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

let handlers: any = null;

try {
  handlers = makeRouteHandler({ config });
} catch (error) {
  console.error('Failed to create Keystatic handlers:', error);
}

export async function GET(request: NextRequest, context: any) {
  try {
    if (!handlers?.GET) {
      return NextResponse.json({ error: 'Keystatic handler not initialized' }, { status: 500 });
    }
    return await handlers.GET(request, context);
  } catch (error) {
    console.error('Keystatic GET error:', error);
    return NextResponse.json({ 
      error: 'Keystatic GET failed', 
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: any) {
  try {
    if (!handlers?.POST) {
      return NextResponse.json({ error: 'Keystatic handler not initialized' }, { status: 500 });
    }
    return await handlers.POST(request, context);
  } catch (error) {
    console.error('Keystatic POST error:', error);
    return NextResponse.json({ 
      error: 'Keystatic POST failed', 
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
