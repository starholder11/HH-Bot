import { NextRequest, NextResponse } from 'next/server';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

// Re-use the region configured for other AWS SDK clients or fall back to us-east-1
const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION || 'us-east-1' });

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();

    const functionName = process.env.LAMBDA_VIDEO_FUNCTION_NAME || 'video-processor';

    const command = new InvokeCommand({
      FunctionName: functionName,
      Payload: Buffer.from(JSON.stringify(payload)),
    });

    const response = await lambdaClient.send(command);

    const textPayload = response.Payload ? new TextDecoder().decode(response.Payload) : undefined;
    const lambdaResult = textPayload ? JSON.parse(textPayload) : null;

    return NextResponse.json({
      success: true,
      statusCode: response.StatusCode,
      executedVersion: response.ExecutedVersion,
      lambdaResult,
    });
  } catch (error) {
    console.error('[video-processing] Lambda invocation failed', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
