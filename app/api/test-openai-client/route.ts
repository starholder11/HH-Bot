import { NextRequest, NextResponse } from 'next/server';
import { getOpenAIClient } from '@/lib/ai-labeling';
import { createOpenAI } from '@ai-sdk/openai';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    console.log('🔍 [TEST-OPENAI] Testing OpenAI client...');

    // Test method 1: getOpenAIClient from ai-labeling
    try {
      const client1 = getOpenAIClient();
      console.log('✅ [TEST-OPENAI] getOpenAIClient() successful');

      // Test a simple API call
      const models = await client1.models.list();
      console.log('✅ [TEST-OPENAI] models.list() successful:', models.data.length, 'models');
    } catch (e) {
      console.error('❌ [TEST-OPENAI] getOpenAIClient() failed:', e);
      throw e;
    }

    // Test method 2: createOpenAI from ai-sdk (like other routes)
    try {
      const client2 = createOpenAI({ apiKey: process.env.OPENAI_API_KEY! });
      console.log('✅ [TEST-OPENAI] createOpenAI() successful');
    } catch (e) {
      console.error('❌ [TEST-OPENAI] createOpenAI() failed:', e);
      throw e;
    }

    return NextResponse.json({
      success: true,
      message: 'OpenAI client test passed',
      apiKeySet: !!process.env.OPENAI_API_KEY,
      apiKeyLength: process.env.OPENAI_API_KEY?.length || 0
    });

  } catch (error) {
    console.error('[TEST-OPENAI] Test failed:', error);
    return NextResponse.json({
      success: false,
      error: 'OpenAI client test failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
