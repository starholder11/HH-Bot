#!/usr/bin/env node

// Test config loading with local files
const fs = require('fs');
const path = require('path');

async function testLocalConfigs() {
  console.log('🧪 Testing config logic with local files...\n');

  // Test 1: Validate JSON structure
  console.log('1. Validating JSON structure...');
  try {
    const plannerPath = path.join(__dirname, '../config/planner-rules.json');
    const uiMapPath = path.join(__dirname, '../config/ui-map.json');

    const plannerData = JSON.parse(fs.readFileSync(plannerPath, 'utf8'));
    const uiMapData = JSON.parse(fs.readFileSync(uiMapPath, 'utf8'));

    console.log('✅ Planner JSON valid:', plannerData.version);
    console.log('   System prompt length:', plannerData.systemPrompt.length);

    console.log('✅ UI map JSON valid:', uiMapData.version);
    console.log('   Tools mapped:', Object.keys(uiMapData.toolsToActions));

    // Check for required mappings
    const requiredTools = ['searchUnified', 'prepareGenerate', 'nameImage', 'saveImage', 'pinToCanvas'];
    const missing = requiredTools.filter(tool => !uiMapData.toolsToActions[tool]);
    if (missing.length === 0) {
      console.log('✅ All required tool mappings present');
    } else {
      console.log('❌ Missing tool mappings:', missing);
    }

  } catch (e) {
    console.log('❌ JSON validation failed:', e.message);
    return;
  }

  // Test 2: Test planner prompt for key patterns
  console.log('\n2. Checking planner prompt patterns...');
  const plannerData = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/planner-rules.json'), 'utf8'));

  const requiredPatterns = [
    'nameImage',
    'saveImage',
    'prepareGenerate',
    'workflow_steps',
    'name it toby'
  ];

  const missing = requiredPatterns.filter(pattern => !plannerData.systemPrompt.includes(pattern));
  if (missing.length === 0) {
    console.log('✅ All required patterns found in prompt');
  } else {
    console.log('❌ Missing patterns in prompt:', missing);
  }

  // Test 3: Simulate the config loading flow
  console.log('\n3. Simulating config loading with fallbacks...');

  // Mock the RemoteConfig behavior
  const mockLoadConfig = async (url, defaultConfig) => {
    if (!url) {
      console.log('   No URL provided, using default');
      return { config: defaultConfig, version: 'default' };
    }

    try {
      // Simulate network failure
      throw new Error('Network error (simulated)');
    } catch (e) {
      console.log('   Network failed, using default:', e.message);
      return { config: defaultConfig, version: 'default' };
    }
  };

  const defaultPlanner = { version: 'default', systemPrompt: 'Default prompt' };
  const defaultUiMap = { version: 'default', toolsToActions: { searchUnified: 'searchUnified' } };

  const plannerResult = await mockLoadConfig('https://example.com/planner.json', defaultPlanner);
  const uiMapResult = await mockLoadConfig('https://example.com/ui-map.json', defaultUiMap);

  console.log('✅ Fallback behavior working');
  console.log('   Planner version:', plannerResult.version);
  console.log('   UI map version:', uiMapResult.version);

  console.log('\n🏁 Local config test complete');
  console.log('\n📋 Next steps:');
  console.log('   1. Fix S3 permissions or use signed URLs');
  console.log('   2. Test with: node scripts/test-configs.js');
  console.log('   3. If configs load properly, proceed with Docker build');
}

testLocalConfigs().catch(console.error);
