import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

export async function GET(request: NextRequest) {
  try {
    console.log('[Test Model API] Request received');
    const filePath = join(process.cwd(), 'public', 'models', 'reference', 'threejs', 'Sponza.glb');
    console.log('[Test Model API] File path:', filePath);
    
    if (!existsSync(filePath)) {
      console.log('[Test Model API] File not found');
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
    
    console.log('[Test Model API] Reading file...');
    const fileBuffer = await readFile(filePath);
    console.log('[Test Model API] File read, size:', fileBuffer.length);
    
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'model/gltf-binary',
        'Content-Length': fileBuffer.length.toString(),
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('[Test Model API] Error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
