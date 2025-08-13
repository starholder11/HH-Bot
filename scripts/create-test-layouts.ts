/**
 * Create test layouts for local development
 * Run with: npx tsx scripts/create-test-layouts.ts
 */

import { promises as fs } from 'fs';
import path from 'path';

// Mock layout data for testing
const testLayouts = [
  {
    id: "test_layout_1",
    filename: "Test Layout 1.json",
    title: "Test Layout 1",
    description: "A test layout for local development",
    media_type: "layout",
    layout_type: "test",
    s3_url: "layouts/test_layout_1.json",
    cloudflare_url: "",
    metadata: {
      file_size: 1024,
      width: 1200,
      height: 800,
      cell_size: 20,
      item_count: 3,
      has_inline_content: true,
      has_transforms: false
    },
    layout_data: {
      designSize: { width: 1200, height: 800 },
      cellSize: 20,
      styling: {
        colors: {
          background: "#0a0a0a",
          text: "#ffffff",
          primary: "#3b82f6",
          secondary: "#6b7280"
        },
        typography: {
          fontFamily: "Inter, system-ui, sans-serif"
        }
      },
      items: [
        {
          id: "item_1",
          type: "inline_text",
          x: 0,
          y: 0,
          w: 20,
          h: 5,
          nx: 0,
          ny: 0,
          nw: 0.33,
          nh: 0.125,
          z: 1,
          inlineContent: {
            text: "Hello World!\nThis is a test layout."
          }
        },
        {
          id: "item_2",
          type: "block",
          blockType: "hero",
          x: 0,
          y: 5,
          w: 30,
          h: 15,
          nx: 0,
          ny: 0.125,
          nw: 0.5,
          nh: 0.375,
          z: 1,
          inlineContent: {
            text: "Hero Section",
            subtitle: "This is a hero block"
          }
        },
        {
          id: "item_3",
          type: "block",
          blockType: "spacer",
          x: 0,
          y: 20,
          w: 60,
          h: 4,
          nx: 0,
          ny: 0.5,
          nw: 1.0,
          nh: 0.1,
          z: 1,
          inlineContent: {}
        }
      ]
    },
    ai_labels: {
      scenes: [],
      objects: [],
      style: ["layout", "test"],
      mood: [],
      themes: ["development", "testing"],
      confidence_scores: {}
    },
    manual_labels: {
      scenes: [],
      objects: [],
      style: [],
      mood: [],
      themes: [],
      custom_tags: ["test"]
    },
    processing_status: {
      upload: "completed",
      metadata_extraction: "completed",
      ai_labeling: "not_started",
      manual_review: "pending",
      html_generation: "pending"
    },
    timestamps: {
      uploaded: new Date().toISOString(),
      metadata_extracted: new Date().toISOString(),
      labeled_ai: null,
      labeled_reviewed: null,
      html_generated: null
    },
    labeling_complete: false,
    project_id: "local_dev",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: "test_layout_2",
    filename: "Large Canvas Layout.json",
    title: "Large Canvas Layout",
    description: "A test layout with large canvas (4000px height)",
    media_type: "layout",
    layout_type: "test",
    s3_url: "layouts/test_layout_2.json",
    cloudflare_url: "",
    metadata: {
      file_size: 2048,
      width: 1200,
      height: 4000,
      cell_size: 20,
      item_count: 5,
      has_inline_content: true,
      has_transforms: false
    },
    layout_data: {
      designSize: { width: 1200, height: 4000 },
      cellSize: 20,
      styling: {
        colors: {
          background: "#1a1a1a",
          text: "#f0f0f0",
          primary: "#8b5cf6",
          secondary: "#f59e0b"
        },
        typography: {
          fontFamily: "Inter, system-ui, sans-serif"
        }
      },
      items: [
        {
          id: "top_item",
          type: "block",
          blockType: "hero",
          x: 0,
          y: 0,
          w: 60,
          h: 10,
          nx: 0,
          ny: 0,
          nw: 1.0,
          nh: 0.05,
          z: 1,
          inlineContent: {
            text: "Top Section",
            subtitle: "This is at the top"
          }
        },
        {
          id: "middle_item",
          type: "inline_text",
          x: 10,
          y: 100,
          w: 40,
          h: 8,
          nx: 0.167,
          ny: 0.5,
          nw: 0.667,
          nh: 0.04,
          z: 1,
          inlineContent: {
            text: "Middle Section\nThis is in the middle of a very tall canvas"
          }
        },
        {
          id: "bottom_item",
          type: "block",
          blockType: "footer",
          x: 0,
          y: 190,
          w: 60,
          h: 8,
          nx: 0,
          ny: 0.95,
          nw: 1.0,
          nh: 0.04,
          z: 1,
          inlineContent: {
            text: "Footer Section",
            subtitle: "This is at the bottom"
          }
        }
      ]
    },
    ai_labels: {
      scenes: [],
      objects: [],
      style: ["layout", "test", "large"],
      mood: [],
      themes: ["development", "testing", "scrolling"],
      confidence_scores: {}
    },
    manual_labels: {
      scenes: [],
      objects: [],
      style: [],
      mood: [],
      themes: [],
      custom_tags: ["test", "large-canvas"]
    },
    processing_status: {
      upload: "completed",
      metadata_extraction: "completed",
      ai_labeling: "not_started",
      manual_review: "pending",
      html_generation: "pending"
    },
    timestamps: {
      uploaded: new Date().toISOString(),
      metadata_extracted: new Date().toISOString(),
      labeled_ai: null,
      labeled_reviewed: null,
      html_generated: null
    },
    labeling_complete: false,
    project_id: "local_dev",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

async function createTestLayouts() {
  // Create local storage directory
  const storageDir = path.join(process.cwd(), 'local-dev-data');
  await fs.mkdir(storageDir, { recursive: true });

  // Save each test layout
  for (const layout of testLayouts) {
    const filePath = path.join(storageDir, `${layout.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(layout, null, 2));
    console.log(`Created test layout: ${layout.title} -> ${filePath}`);
  }

  // Create an index file
  const index = {
    layouts: testLayouts.map(l => ({
      id: l.id,
      title: l.title,
      description: l.description,
      created_at: l.created_at,
      height: l.layout_data.designSize.height
    }))
  };

  const indexPath = path.join(storageDir, 'layouts-index.json');
  await fs.writeFile(indexPath, JSON.stringify(index, null, 2));
  console.log(`Created layouts index: ${indexPath}`);

  console.log('\n✅ Test layouts created! Now create .env.local with:');
  console.log('USE_LOCAL_DEV_DATA=true');
  console.log('LOCAL_DEV_DATA_DIR=./local-dev-data');
}

createTestLayouts().catch(console.error);
