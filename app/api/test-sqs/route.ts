import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Check environment variables
    const sqsUrl = process.env.SQS_QUEUE_URL;
    const awsRegion = process.env.AWS_REGION;
    
    console.log('SQS_QUEUE_URL:', sqsUrl);
    console.log('AWS_REGION:', awsRegion);
    
    if (!sqsUrl) {
      return NextResponse.json({
        error: 'SQS_QUEUE_URL not set',
        env_vars: {
          SQS_QUEUE_URL: sqsUrl,
          AWS_REGION: awsRegion
        }
      }, { status: 500 });
    }
    
    // Test enqueue
    const { enqueueAnalysisJob } = await import('@/lib/queue');
    
    const assetId = (request.nextUrl.searchParams.get('assetId')) || 'test-image-123';
    const mediaType = (request.nextUrl.searchParams.get('mediaType')) || 'image';
    const title = (request.nextUrl.searchParams.get('title')) || 'Test Image';
    const s3Url = (request.nextUrl.searchParams.get('s3Url')) || 'https://example.com/test.jpg';
    const cloudflareUrl = (request.nextUrl.searchParams.get('cloudflareUrl')) || s3Url;

    const testPayload = {
      assetId,
      mediaType,
      title,
      s3Url,
      cloudflareUrl,
      requestedAt: Date.now(),
      stage: 'post_labeling_ingestion'
    };
    
    await enqueueAnalysisJob(testPayload);
    
    return NextResponse.json({
      success: true,
      message: 'SQS test message sent successfully',
      env_vars: {
        SQS_QUEUE_URL: sqsUrl ? '✅ Set' : '❌ Missing',
        AWS_REGION: awsRegion || 'us-east-1 (default)'
      },
      payload: testPayload
    });
    
  } catch (error) {
    console.error('SQS test failed:', error);
    return NextResponse.json({
      error: 'SQS test failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      env_vars: {
        SQS_QUEUE_URL: process.env.SQS_QUEUE_URL ? '✅ Set' : '❌ Missing',
        AWS_REGION: process.env.AWS_REGION || 'us-east-1 (default)'
      }
    }, { status: 500 });
  }
}
