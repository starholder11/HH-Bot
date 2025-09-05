import { NextRequest, NextResponse } from 'next/server';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION || 'us-east-1' });

export async function POST(req: NextRequest) {
  try {
    const { textAssetId, userMessage, assistantResponse, conversationId, correlationId } = await req.json();
    
    console.log(`[${correlationId}] Internal trigger-scribe v2 called for: ${textAssetId}`);
    console.log(`[${correlationId}] AWS region:`, process.env.AWS_REGION || 'us-east-1');
    console.log(`[${correlationId}] AWS credentials available:`, !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY));
    
    // Invoke Lambda using modern AWS SDK v3
    const command = new InvokeCommand({
      FunctionName: 'background-summarizer',
      InvocationType: 'Event', // Async invocation
      Payload: Buffer.from(JSON.stringify({
        textAssetId,
        userMessage,
        assistantResponse,
        conversationId,
        correlationId
      }))
    });
    
    const response = await lambdaClient.send(command);
    
    console.log(`[${correlationId}] ✅ Lambda invoked successfully for: ${textAssetId}`);
    console.log(`[${correlationId}] Lambda response status:`, response.StatusCode);
    
    return NextResponse.json({
      success: true,
      textAssetId,
      correlationId,
      statusCode: response.StatusCode
    });
    
  } catch (error) {
    console.error('Trigger scribe failed:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
