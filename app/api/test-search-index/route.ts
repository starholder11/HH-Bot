import { updateSearchIndexFile } from '../../../lib/search/search-index';

export async function GET() {
  try {
    console.log('🧪 Testing search index file generation...');
    await updateSearchIndexFile();
    
    return Response.json({
      success: true,
      message: 'Search index file generated successfully'
    });
    
  } catch (error) {
    console.error('❌ Search index file generation failed:', error);
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 