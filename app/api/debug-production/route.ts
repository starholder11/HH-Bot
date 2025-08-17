import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // Security check - only allow in development or when explicitly enabled
  if (process.env.NODE_ENV === 'production' && !process.env.ENABLE_DEBUG_ENDPOINTS) {
    return NextResponse.json({ error: 'Disabled in production' }, { status: 404 });
  }
  const isDev = process.env.NODE_ENV === 'development';
  const hasDebugHeader = request.headers.get('x-debug-key') === process.env.DEBUG_KEY;

  if (!isDev && !hasDebugHeader) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const debug = {
    timestamp: new Date().toISOString(),
    environment: {
      NODE_ENV: process.env.NODE_ENV,
      VERCEL_ENV: process.env.VERCEL_ENV,
      VERCEL: process.env.VERCEL,
      VERCEL_URL: process.env.VERCEL_URL,
    },
    openai: {
      api_key_configured: !!process.env.OPENAI_API_KEY,
      api_key_placeholder: process.env.OPENAI_API_KEY?.includes('your_openai_api_key_here') || false,
      api_key_prefix: process.env.OPENAI_API_KEY?.substring(0, 7) || 'missing',
    },
    aws: {
      access_key_configured: !!process.env.AWS_ACCESS_KEY_ID,
      secret_key_configured: !!process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION || 'missing',
      s3_bucket: process.env.AWS_S3_BUCKET || process.env.S3_BUCKET_NAME || 'missing',
      cloudfront_domain: process.env.AWS_CLOUDFRONT_DOMAIN || 'missing',
    },
    sqs: {
      queue_url_configured: !!process.env.SQS_QUEUE_URL,
      queue_url_placeholder: process.env.SQS_QUEUE_URL?.includes('your-account-id') || false,
      queue_url: process.env.SQS_QUEUE_URL ? 'configured' : 'missing',
      public_api_base_url: process.env.PUBLIC_API_BASE_URL || 'missing',
    },
    video_processing: {
      lambda_function_name: process.env.LAMBDA_VIDEO_FUNCTION_NAME || 'video-processor',
      use_lambda: process.env.NEXT_PUBLIC_USE_LAMBDA || 'false',
    },
    issues: [] as string[],
  };

  // Identify critical issues
  if (!process.env.OPENAI_API_KEY) {
    debug.issues.push('CRITICAL: OPENAI_API_KEY is missing');
  } else if (process.env.OPENAI_API_KEY.includes('your_openai_api_key_here')) {
    debug.issues.push('CRITICAL: OPENAI_API_KEY is using placeholder value');
  }

  if (!process.env.SQS_QUEUE_URL) {
    debug.issues.push('CRITICAL: SQS_QUEUE_URL is missing - videos will get stuck in "Starting" status');
  } else if (process.env.SQS_QUEUE_URL.includes('your-account-id')) {
    debug.issues.push('CRITICAL: SQS_QUEUE_URL is using placeholder value');
  }

  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    debug.issues.push('CRITICAL: AWS credentials are missing');
  }

  if (!process.env.PUBLIC_API_BASE_URL) {
    debug.issues.push('WARNING: PUBLIC_API_BASE_URL is missing - Lambda may not be able to callback');
  }

  return NextResponse.json(debug, {
    headers: { 'Content-Type': 'application/json' },
    status: debug.issues.length > 0 ? 500 : 200
  });
}
