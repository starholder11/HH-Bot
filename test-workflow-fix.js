#!/usr/bin/env node

/**
 * Test script to verify the Generate → Rename → Save → Pin workflow fix
 *
 * This script tests the following scenarios:
 * 1. Image generation + rename + pin
 * 2. Video generation + rename + pin
 * 3. Just rename existing content + pin
 *
 * Run with: node test-workflow-fix.js
 */

const testCases = [
  {
    name: "Image Generation + Rename + Pin",
    input: "create a picture of a penguin, name it mr_penguin and pin it to the canvas",
    expectedSteps: ["prepareGenerate", "nameImage", "saveImage", "pinToCanvas"],
    expectedName: "mr_penguin"
  },
  {
    name: "Video Generation + Rename + Pin",
    input: "make a video of a drummer, call it cool_drummer_guy and pin it to the canvas",
    expectedSteps: ["generateContent", "nameImage", "saveImage", "pinToCanvas"],
    expectedName: "cool_drummer_guy"
  },
  {
    name: "Rename Existing + Pin",
    input: "name it sunset_beach and pin it to the canvas",
    expectedSteps: ["nameImage", "saveImage", "pinToCanvas"],
    expectedName: "sunset_beach"
  },
  {
    name: "Just Rename Existing",
    input: "call it mountain_view",
    expectedSteps: ["nameImage"],
    expectedName: "mountain_view"
  }
];

async function testWorkflow(testCase) {
  console.log(`\n🧪 Testing: ${testCase.name}`);
  console.log(`📝 Input: "${testCase.input}"`);

  try {
    const response = await fetch('http://localhost:3000/api/agent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          { role: 'user', content: testCase.input }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    console.log('📡 Streaming response...');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let steps = [];
    let nameFound = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const event = JSON.parse(line.slice(6));
            if (event.action && event.action !== 'chat') {
              steps.push(event.action);
              console.log(`  ✅ Step: ${event.action}`);

              if (event.action === 'nameImage' && event.payload?.name) {
                nameFound = event.payload.name;
                console.log(`  🏷️  Name: ${nameFound}`);
              }
            }
          } catch (e) {
            // Ignore parse errors for non-JSON lines
          }
        }
      }
    }

    // Verify results
    const stepsMatch = JSON.stringify(steps) === JSON.stringify(testCase.expectedSteps);
    const nameMatch = nameFound === testCase.expectedName;

    console.log(`\n📊 Results:`);
    console.log(`  Expected steps: ${testCase.expectedSteps.join(' → ')}`);
    console.log(`  Actual steps:   ${steps.join(' → ')}`);
    console.log(`  Steps match: ${stepsMatch ? '✅' : '❌'}`);
    console.log(`  Expected name: ${testCase.expectedName}`);
    console.log(`  Actual name:   ${nameFound}`);
    console.log(`  Name match: ${nameMatch ? '✅' : '❌'}`);

    return stepsMatch && nameMatch;

  } catch (error) {
    console.error(`❌ Test failed: ${error.message}`);
    return false;
  }
}

async function runAllTests() {
  console.log('🚀 Testing Generate → Rename → Save → Pin Workflow Fix\n');

  let passed = 0;
  let total = testCases.length;

  for (const testCase of testCases) {
    const success = await testWorkflow(testCase);
    if (success) {
      passed++;
      console.log(`✅ PASSED\n`);
    } else {
      console.log(`❌ FAILED\n`);
    }
  }

  console.log(`\n🏁 Test Summary: ${passed}/${total} tests passed`);

  if (passed === total) {
    console.log('🎉 All tests passed! The workflow fix is working correctly.');
    process.exit(0);
  } else {
    console.log('💥 Some tests failed. Please check the implementation.');
    process.exit(1);
  }
}

// Check if running directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = { testCases, testWorkflow, runAllTests };
