import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { textAssetId, userMessage, assistantResponse, conversationId, correlationId } = await req.json();
    
    console.log(`[${correlationId}] Internal trigger-scribe called for: ${textAssetId}`);
    
    // Invoke Lambda using AWS SDK (available in Node.js runtime)
    const AWS = require('aws-sdk');
    const lambda = new AWS.Lambda({ region: 'us-east-1' });
    
    await lambda.invoke({
      FunctionName: 'background-summarizer',
      InvocationType: 'Event', // Async invocation
      Payload: JSON.stringify({
        textAssetId,
        userMessage,
        assistantResponse,
        conversationId,
        correlationId
      })
    }).promise();
    
    console.log(`[${correlationId}] ✅ Lambda invoked successfully for: ${textAssetId}`);
    
    return NextResponse.json({
      success: true,
      textAssetId,
      correlationId
    });
    
  } catch (error) {
    console.error('Trigger scribe failed:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
