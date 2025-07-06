import { promises as fs } from 'fs';

export async function GET() {
  try {
    console.log('🔍 Starting debug search route...');
    
    // Test 1: Can we write to /tmp/?
    console.log('📝 Testing write to /tmp/...');
    await fs.writeFile('/tmp/test.json', JSON.stringify({ test: 'working', timestamp: new Date().toISOString() }));
    
    // Test 2: Can we read it back?
    console.log('📖 Testing read from /tmp/...');
    const data = await fs.readFile('/tmp/test.json', 'utf8');
    
    // Test 3: Does search index exist?
    console.log('🔎 Checking if search index exists...');
    const searchExists = await fs.access('/tmp/search-index.json')
      .then(() => true)
      .catch(() => false);
    
    // Test 4: If it exists, what's in it?
    let searchContent = null;
    if (searchExists) {
      console.log('📄 Reading search index content...');
      searchContent = await fs.readFile('/tmp/search-index.json', 'utf8');
    }
    
    // Test 5: List all files in /tmp/
    console.log('📋 Listing /tmp/ directory...');
    const tmpFiles = await fs.readdir('/tmp/');
    
    const result = {
      tmpWritable: true,
      testData: JSON.parse(data),
      searchIndexExists: searchExists,
      searchIndexContent: searchContent ? JSON.parse(searchContent) : null,
      tmpFiles: tmpFiles,
      timestamp: new Date().toISOString()
    };
    
    console.log('✅ Debug route completed successfully');
    return Response.json(result);
  } catch (error) {
    console.error('❌ Debug route failed:', error);
    return Response.json({
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
} 