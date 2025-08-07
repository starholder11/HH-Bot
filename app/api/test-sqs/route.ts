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
    
    const testPayload = {
      assetId: 'test-image-123',
      mediaType: 'image',
      title: 'Test Image',
      s3Url: 'https://example.com/test.jpg',
      cloudflareUrl: 'https://example.com/test.jpg',
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
      }
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
