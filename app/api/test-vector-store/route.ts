import { NextRequest, NextResponse } from 'next/server';
import { getOpenAIClient } from '@/lib/ai-labeling';

const VECTOR_STORE_ID = 'vs_6860128217f08191bacd30e1475d8566';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    console.log('🔍 [TEST-VECTOR] Testing vector store operations...');

    const openai = getOpenAIClient();
    console.log('✅ [TEST-VECTOR] OpenAI client created');

    // Test vector store access
    const vectorStore = await openai.vectorStores.retrieve(VECTOR_STORE_ID);
    console.log('✅ [TEST-VECTOR] Vector store accessible:', vectorStore.id);

    // Test file upload
    const testContent = "# Test File\n\nThis is a test file for vector store upload.";
    const buffer = Buffer.from(testContent, 'utf8');
    const file = new File([buffer], 'test-file.md', { type: 'text/markdown' });

    console.log('🔍 [TEST-VECTOR] Uploading test file...');
    const fileInfo = await openai.files.create({ file, purpose: 'assistants' } as any);
    console.log('✅ [TEST-VECTOR] File uploaded:', fileInfo.id);

    // Test vector store file creation
    console.log('🔍 [TEST-VECTOR] Adding file to vector store...');
    const vectorStoreFile = await openai.vectorStores.files.create(
      VECTOR_STORE_ID,
      {
        file_id: fileInfo.id,
        attributes: {
          filename: 'test-file.md',
        },
      } as any
    );
    console.log('✅ [TEST-VECTOR] Vector store file created:', vectorStoreFile.id);

    // Cleanup
    try {
      await openai.vectorStores.files.del(VECTOR_STORE_ID, vectorStoreFile.id);
      await openai.files.del(fileInfo.id);
      console.log('✅ [TEST-VECTOR] Cleanup completed');
    } catch (e) {
      console.warn('⚠️ [TEST-VECTOR] Cleanup failed (non-critical):', e);
    }

    return NextResponse.json({
      success: true,
      message: 'Vector store test passed',
      vectorStoreId: VECTOR_STORE_ID,
      testFileId: fileInfo.id,
      vectorStoreFileId: vectorStoreFile.id
    });

  } catch (error) {
    console.error('[TEST-VECTOR] Test failed:', error);
    return NextResponse.json({
      success: false,
      error: 'Vector store test failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : 'No stack'
    }, { status: 500 });
  }
}
