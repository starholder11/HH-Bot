import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

export async function GET(request: NextRequest) {
  try {
    console.log('[Sponza API] Request received');
    const filePath = join(process.cwd(), 'public', 'models', 'reference', 'threejs', 'Sponza.glb');
    console.log('[Sponza API] File path:', filePath);
    
    // Check if file exists
    if (!existsSync(filePath)) {
      console.log('[Sponza API] File not found');
      return NextResponse.json({ error: 'Sponza model not found' }, { status: 404 });
    }
    
    console.log('[Sponza API] Reading file...');
    const fileBuffer = await readFile(filePath);
    console.log('[Sponza API] File read successfully, size:', fileBuffer.length, 'bytes');
    
    // Return the GLB file with proper headers
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'model/gltf-binary',
        'Content-Length': fileBuffer.length.toString(),
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  } catch (error) {
    console.error('[Sponza API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to serve Sponza model' },
      { status: 500 }
    );
  }
}
