import { NextRequest, NextResponse } from 'next/server';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

// Re-use the region configured for other AWS SDK clients or fall back to us-east-1
const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION || 'us-east-1' });

export async function POST(request: NextRequest) {
  try {
    // Debug: Log environment setup
    console.log('[video-processing] Lambda route called');
    console.log('[video-processing] AWS_REGION:', process.env.AWS_REGION || 'us-east-1');
    console.log('[video-processing] LAMBDA_VIDEO_FUNCTION_NAME:', process.env.LAMBDA_VIDEO_FUNCTION_NAME || 'video-processor');
    console.log('[video-processing] AWS credentials available:', !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY));

    const payload = await request.json();
    console.log('[video-processing] Payload:', payload);

    // Add callback URL to payload so Lambda knows where to call back
    const baseUrl = process.env.PUBLIC_API_BASE_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

    // Inject callback URL into each record's body
    const enhancedPayload = {
      ...payload,
      Records: payload.Records.map((record: any) => ({
        ...record,
        body: JSON.stringify({
          ...JSON.parse(record.body),
          callbackBaseUrl: baseUrl
        })
      }))
    };

    console.log('[video-processing] Enhanced payload with callback URL:', baseUrl);

    const functionName = 'video-processor'; // Simple - we only have one function

    const command = new InvokeCommand({
      FunctionName: functionName,
      Payload: Buffer.from(JSON.stringify(enhancedPayload)),
    });

    console.log('[video-processing] Invoking Lambda function:', functionName);
    const response = await lambdaClient.send(command);
    console.log('[video-processing] Lambda response status:', response.StatusCode);

    const textPayload = response.Payload ? new TextDecoder().decode(response.Payload) : undefined;
    const lambdaResult = textPayload ? JSON.parse(textPayload) : null;

    console.log('[video-processing] Lambda result:', lambdaResult);

    return NextResponse.json({
      success: true,
      statusCode: response.StatusCode,
      executedVersion: response.ExecutedVersion,
      lambdaResult,
    });
  } catch (error) {
    console.error('[video-processing] Lambda invocation failed:', error);

    // Enhanced error information
    const errorDetails = {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : 'Unknown error',
      code: (error as any)?.code,
      statusCode: (error as any)?.$metadata?.httpStatusCode,
    };

    console.error('[video-processing] Error details:', errorDetails);

    return NextResponse.json(
      {
        success: false,
        error: errorDetails,
        debug: {
          hasAwsCredentials: !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY),
          region: process.env.AWS_REGION || 'us-east-1',
          functionName: process.env.LAMBDA_VIDEO_FUNCTION_NAME || 'video-processor'
        }
      },
      { status: 500 }
    );
  }
}
