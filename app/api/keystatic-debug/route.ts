import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Test if we can import the config
    const config = await import('../../../keystatic.config');
    
    // Check environment variables
    const env = {
      NODE_ENV: process.env.NODE_ENV,
      KEYSTATIC_GITHUB_CLIENT_ID: process.env.KEYSTATIC_GITHUB_CLIENT_ID ? 'SET' : 'MISSING',
      KEYSTATIC_GITHUB_CLIENT_SECRET: process.env.KEYSTATIC_GITHUB_CLIENT_SECRET ? 'SET' : 'MISSING',
      KEYSTATIC_SECRET: process.env.KEYSTATIC_SECRET ? 'SET' : 'MISSING',
    };

    return NextResponse.json({
      success: true,
      config: {
        storage: config.default.storage,
        collections: Object.keys(config.default.collections || {}),
      },
      environment: env,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}