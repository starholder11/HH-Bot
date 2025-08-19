#!/usr/bin/env node

// Smoke test for remote configs
async function testConfigs() {
  console.log('🧪 Testing remote config loading...\n');

  // Test 1: Direct S3 fetch
  console.log('1. Testing direct S3 access...');
  try {
    const plannerUrl = 'https://hh-bot-images-2025-prod.s3.amazonaws.com/config/planner-rules.json';
    const uiMapUrl = 'https://hh-bot-images-2025-prod.s3.amazonaws.com/config/ui-map.json';

    const plannerRes = await fetch(plannerUrl);
    const uiMapRes = await fetch(uiMapUrl);

    if (plannerRes.ok && uiMapRes.ok) {
      const plannerData = await plannerRes.json();
      const uiMapData = await uiMapRes.json();

      console.log('✅ Planner config accessible:', plannerData.version);
      console.log('✅ UI map config accessible:', uiMapData.version);
      console.log('   Tools mapped:', Object.keys(uiMapData.toolsToActions).length);
    } else {
      console.log('❌ S3 configs not accessible');
      console.log('   Planner status:', plannerRes.status);
      console.log('   UI map status:', uiMapRes.status);
    }
  } catch (e) {
    console.log('❌ S3 fetch failed:', e.message);
  }

  // Test 2: Vercel API endpoint
  console.log('\n2. Testing Vercel API with configs...');
  try {
    const testPayload = {
      messages: [{ role: 'user', content: 'make a picture of a cat and name it smoketest' }]
    };

    const response = await fetch('https://hh-bot-lyart.vercel.app/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testPayload)
    });

    if (response.ok) {
      const uiMapVersion = response.headers.get('x-ui-map-version');
      console.log('✅ Vercel API responding');
      console.log('   UI map version header:', uiMapVersion || 'missing');

      // Read first chunk to see if it contains expected actions
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const { value } = await reader.read();
      const chunk = decoder.decode(value);

      if (chunk.includes('nameImage') || chunk.includes('prepareGenerate')) {
        console.log('✅ Response contains expected actions');
      } else {
        console.log('⚠️  Response may not contain expected workflow steps');
        console.log('   First chunk:', chunk.substring(0, 200) + '...');
      }
    } else {
      console.log('❌ Vercel API failed:', response.status);
    }
  } catch (e) {
    console.log('❌ Vercel API test failed:', e.message);
  }

  // Test 3: Backend API (if accessible)
  console.log('\n3. Testing backend API...');
  try {
    const backendUrl = 'http://lancedb-bulletproof-simple-alb-705151448.us-east-1.elb.amazonaws.com';
    const healthRes = await fetch(`${backendUrl}/api/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });

    if (healthRes.ok) {
      const health = await healthRes.json();
      console.log('✅ Backend accessible');
      console.log('   Build fingerprint:', health.buildFingerprint || 'missing');
    } else {
      console.log('❌ Backend health check failed:', healthRes.status);
    }
  } catch (e) {
    console.log('⚠️  Backend not accessible (expected if not deployed):', e.message);
  }

  console.log('\n🏁 Smoke test complete');
}

testConfigs().catch(console.error);
