import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  try {
    const pathSegments = params.path;
    const filePath = join(process.cwd(), 'public', 'models', ...pathSegments);
    
    // Security check: ensure the path is within the models directory
    if (!filePath.includes('/public/models/')) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }
    
    // Check if file exists
    if (!existsSync(filePath)) {
      return NextResponse.json({ error: 'Model not found' }, { status: 404 });
    }
    
    // Read the binary file
    const fileBuffer = await readFile(filePath);
    
    // Determine content type based on file extension
    const ext = pathSegments[pathSegments.length - 1]?.split('.').pop()?.toLowerCase();
    let contentType = 'application/octet-stream';
    
    switch (ext) {
      case 'glb':
        contentType = 'model/gltf-binary';
        break;
      case 'gltf':
        contentType = 'model/gltf+json';
        break;
      case 'obj':
        contentType = 'text/plain';
        break;
      case 'fbx':
        contentType = 'application/octet-stream';
        break;
    }
    
    // Return the file with proper headers
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': fileBuffer.length.toString(),
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  } catch (error) {
    console.error('Model serving error:', error);
    return NextResponse.json(
      { error: 'Failed to serve model file' },
      { status: 500 }
    );
  }
}
