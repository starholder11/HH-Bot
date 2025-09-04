import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { title = 'Test Scribe Document' } = await req.json();
    
    console.log('[test-scribe-tool] Testing backend tool with title:', title);
    
    const agentBackend = process.env.AGENT_BACKEND_URL || process.env.LANCEDB_API_URL;
    if (!agentBackend) {
      return NextResponse.json({ error: 'Agent backend not configured' }, { status: 500 });
    }

    console.log('[test-scribe-tool] Calling backend at:', agentBackend);
    
    const toolResponse = await fetch(`${agentBackend}/api/agent-comprehensive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Execute tool: createBackgroundDocDraft with title="${title}" conversationId="test_${Date.now()}"`,
        userId: 'test-user',
        tenantId: 'default'
      })
    });

    console.log('[test-scribe-tool] Backend response status:', toolResponse.status);
    
    if (toolResponse.ok) {
      const result = await toolResponse.json();
      console.log('[test-scribe-tool] Backend response:', JSON.stringify(result, null, 2));
      
      return NextResponse.json({
        success: true,
        backendStatus: toolResponse.status,
        backendResponse: result,
        extractedResults: result?.execution?.results?.[0] || result?.execution || result
      });
    } else {
      const errorText = await toolResponse.text();
      console.error('[test-scribe-tool] Backend error:', errorText);
      
      return NextResponse.json({
        success: false,
        backendStatus: toolResponse.status,
        backendError: errorText
      }, { status: 500 });
    }
    
  } catch (error) {
    console.error('[test-scribe-tool] Request failed:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
