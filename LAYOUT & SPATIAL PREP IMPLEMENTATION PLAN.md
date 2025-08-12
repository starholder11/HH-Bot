## LAYOUT & SPATIAL PREP IMPLEMENTATION PLAN

### Goals

- **Introduce first-class Layouts asset type**: Full media asset with JSON structure + optional HTML snapshots
- **Replace freeform canvas collision nightmare**: RGL-based canvas with bulletproof no-overlap, snapping, boundaries
- **Build lightweight Blueprint Composer**: Fast assembly tool using RGL + predefined blocks + simple forms (NO GrapesJS bloat)
- **Enable 3D spatial mapping**: Normalized layout coordinates feed directly into R3F plane positioning
- **Fast fashion web pages**: Rapid assembly of basic layout blueprints without heavy customization overhead

---

## High-level Architecture

### **Canvas (Selection & Arrangement)**
- **Purpose**: Collect, arrange, organize search results; NOT a full authoring tool
- **Engine**: React Grid Layout with `preventCollision={true}` - no custom collision math
- **Output**: Grid coordinates (px) + normalized layout (0-1) for 3D mapping
- **UI**: Modal + non-modal modes; cards with expand/collapse; drag/resize/snap

### **Blueprint Composer (Layout Authoring)**
- **Purpose**: Assemble content into structured page layouts using predefined blocks
- **Engine**: RGL for block positioning + react-hook-form for block configuration
- **Blocks**: Hero, MediaGrid, TextSection, CTA, Footer (~5-8 total, fixed catalog)
- **Weight**: ~100KB total (RGL + forms + optional TipTap) vs 500KB+ GrapesJS
- **Output**: LayoutAsset JSON + optional HTML snapshot

### **Layouts Asset Type**
- **Storage**: S3 JSON (primary) + optional HTML (for static export)
- **Discovery**: Full CRUD API under `/api/layouts/`
- **Sources**: Import from Canvas OR author in Blueprint Composer
- **Integration**: Appears in unified search, project management, asset browser

### **3D Spatial Prep**
- **Input**: Normalized layout coordinates (0-1) from LayoutAsset
- **Mapping**: 2D grid → R3F plane positions with preserved aspect ratios
- **Future**: Spatial navigation, 3D content arrangement, VR/AR export

---

## Data Model & Storage

### LayoutAsset Type (Full Media Asset)

```typescript
// Add to app/visual-search/types/index.ts
export type LayoutAsset = {
  // Core asset fields (matches existing media assets)
  id: string;
  filename: string;                     // e.g., "my-landing-page.json"
  title: string;
  description?: string;
  projectId?: string;

  // Layout-specific metadata
  media_type: 'layout';                 // New media type
  layout_type: 'canvas_export' | 'blueprint_composer' | 'imported';

    // Layout structure
  layout: {
    designSize: { width: number; height: number };  // e.g., { width: 1440, height: 1024 }
    cellSize: number;                   // RGL cell size (e.g., 20px)

    // Global layout styling
    styling: {
      theme?: 'light' | 'dark' | 'custom';
      colors?: {
        primary?: string;
        secondary?: string;
        background?: string;
        text?: string;
        accent?: string;
      };
      typography?: {
        fontFamily?: string;
        headingFont?: string;
        bodyFont?: string;
      };
      customCSS?: string;               // Raw CSS for advanced styling
      cssFileUrl?: string;              // External CSS file reference
    };

    // Content items (from canvas pins or composer blocks)
    items: Array<{
      id: string;                       // local layout item id
      type: 'content_ref' | 'inline_text' | 'inline_image' | 'block';

      // Position (both px and normalized)
      x: number; y: number;             // px coordinates
      w: number; h: number;             // px dimensions
      nx: number; ny: number;           // normalized 0-1 coordinates
      nw: number; nh: number;           // normalized 0-1 dimensions
      z?: number;                       // layer order

      // Content reference (for existing media assets)
      refId?: string;                   // original search result id
      contentType?: 'video' | 'image' | 'audio' | 'text' | 'layout' | '3d_object' | 'shader' | 'playlist';
      mediaUrl?: string;
      snippet?: string;

      // Inline content (stored directly in layout)
      inlineContent?: {
        text?: string;                  // For inline_text blocks
        html?: string;                  // Rich text HTML
        imageData?: string;             // Base64 or blob URL for inline images
        imageUrl?: string;              // External image URL
      };

      // Display transforms (generic system for any content type)
      transform?: {
        component: string;              // React component name (e.g., 'ScrollingText', 'ImageCarousel')
        props?: Record<string, any>;    // Component-specific configuration
        animation?: {
          type: 'scroll' | 'fade' | 'slide' | 'rotate' | 'scale' | 'custom';
          duration?: number;
          direction?: 'up' | 'down' | 'left' | 'right';
          loop?: boolean;
          customCSS?: string;
        };
        container?: {
          overflow: 'visible' | 'hidden' | 'scroll' | 'auto';
          background?: string;
          border?: string;
          borderRadius?: string;
        };
      };

      // Block configuration (for predefined blocks)
      blockType?: 'hero' | 'media_grid' | 'text_section' | 'cta' | 'footer' | 'spacer';
      config?: Record<string, any>;     // block-specific settings
    }>;
  };

  // Export formats
  html?: string;                        // optional static HTML snapshot
  css?: string;                         // optional styles

  // Standard asset fields
  s3_url: string;                       // JSON storage
  cloudflare_url?: string;              // CDN if available
  processing_status: {
    created: 'completed';
    html_generated: 'pending' | 'completed' | 'error';
  };
  timestamps: {
    created: string;
    updated: string;
    html_generated?: string;
  };
  created_at: string;
  updated_at: string;
};
```

### Storage & Persistence

- **S3 Structure**:
  - Primary: `layouts/{id}.json` (LayoutAsset JSON)
  - Optional: `layouts/{id}.html` (static export)
  - Optional: `layouts/{id}.css` (styles)

- **Integration with existing `lib/media-storage.ts`**:
  - Extend `MediaAsset` union to include `LayoutAsset`
  - Add `media_type: 'layout'` to existing asset management
  - Reuse existing S3 upload/download, caching, project association

- **Unified Search Integration**:
  - Add `ContentType = 'layout'` to search filters
  - Layouts appear in search results alongside images/videos/audio/text
  - Search by layout name, description, contained content

---

## API Endpoints

### Extend Existing Media APIs (Preferred Approach)

**Reuse existing media asset infrastructure instead of separate `/api/layouts/`**:

- `app/api/media-assets/route.ts` - extend to handle `media_type: 'layout'`
- `app/api/media-assets/[id]/route.ts` - existing CRUD works for layouts
- `app/api/unified-search/route.ts` - extend to include layout content type

### Layout-Specific Endpoints

- `app/api/layouts/export/[id]/route.ts` - generate/serve HTML export
- `app/api/layouts/import-canvas/route.ts` - convert canvas pins to layout
- `app/api/layouts/duplicate/[id]/route.ts` - clone layout with new ID

### Data Contracts

**Create Layout (POST `/api/media-assets`)**:
```json
{
  "media_type": "layout",
  "title": "Landing Page v1",
  "description": "Hero + media grid + CTA",
  "projectId": "proj_123",
  "layout_type": "blueprint_composer",
  "layout": {
    "designSize": { "width": 1440, "height": 1024 },
    "cellSize": 20,
    "items": [...]
  },
  "html": "<html>...</html>"
}
```

**Import from Canvas (POST `/api/layouts/import-canvas`)**:
```json
{
  "title": "Canvas Export",
  "canvasId": "canvas_123",
  "projectId": "proj_123"
}
// Returns: full LayoutAsset with converted pins
```

**Export HTML (GET `/api/layouts/export/{id}`)**:
- Returns: `text/html` with rendered layout
- Query: `?format=html|pdf|png` (future formats)

---

## UI/UX Changes

### 1) Replace Freeform Canvas with RGL Canvas

**File**: `app/visual-search/components/Canvas/CanvasBoardRGL.tsx`

```tsx
// Key RGL configuration - NO CUSTOM COLLISION CODE
<ResponsiveGridLayout
  preventCollision={true}        // ← Bulletproof collision prevention
  compactType={null}            // ← No auto-compacting
  isDraggable={true}
  isResizable={true}
  margin={[8, 8]}
  containerPadding={[16, 16]}
  rowHeight={20}                // ← Small cells = feels freeform
  cols={{ lg: 72, md: 60, sm: 48, xs: 36, xxs: 24 }}
  onDragStop={handleDragStop}
  onResizeStop={handleResizeStop}
>
```

**Integration**:
- Update `app/visual-search/page.tsx` dynamic import to `CanvasBoardRGL`
- Keep existing modal wrapper, handlers (`onMove`, `onResize`, `onRemove`, `onOpen`)
- Add "Export to Layout" button in canvas toolbar

**What we DELETE**:
- Entire `CanvasBoard.tsx` (470 lines of collision hell)
- `@shopify/draggable` dependency and all manual collision detection
- `findSnapPosition`, `checkCollision` functions and related math

### 2) Blueprint Composer (Lightweight Page Builder)

**File**: `app/blueprint-composer/page.tsx`

**Architecture**:
- **Layout Engine**: Same RGL setup as canvas
- **Block Library**: Fixed catalog of 5-8 predefined blocks
- **Configuration**: react-hook-form side panel (not in-canvas editing)
- **Text Editing**: TipTap StarterKit only for text-heavy blocks (optional)
- **Weight**: ~100KB vs 500KB+ GrapesJS

**Block Types**:
```typescript
type BlockType =
  | 'hero'           // Title + subtitle + CTA + background image
  | 'media_grid'     // 2x2 or 3x3 grid of media items
  | 'text_section'   // Rich text content block
  | 'cta'            // Call-to-action with button
  | 'footer'         // Links + copyright
  | 'spacer'         // Empty spacing block
  | 'inline_text'    // Lightweight text block (stored in layout, not as media asset)
  | 'inline_image'   // Lightweight image block (stored in layout, not as media asset)
  | 'content_ref';   // Reference to existing media asset with display transforms
```

**Enhanced Workflow**:
1. **Layout Setup**: Configure global styling (theme, colors, typography, CSS)
2. **Block Assembly**: Drag blocks from sidebar onto RGL canvas
3. **Content Configuration**:
   - **Inline blocks**: Type text directly, upload lightweight images
   - **Content refs**: Link to existing media assets
   - **Display transforms**: Apply animations, containers, custom components
4. **Block Styling**: Configure in side panel (content, transforms, block-specific settings)
5. **Save & Export**: LayoutAsset with JSON structure + styled HTML snapshot

**Transform System Examples**:
```typescript
// Star Wars scrolling text
{
  type: 'content_ref',
  refId: 'text_asset_123',
  transform: {
    component: 'ScrollingText',
    animation: {
      type: 'scroll',
      direction: 'up',
      duration: 30000,
      loop: true
    },
    container: {
      overflow: 'hidden',
      background: 'black'
    }
  }
}

// Image carousel for media grid
{
  type: 'content_ref',
  refId: 'playlist_456',
  transform: {
    component: 'ImageCarousel',
    props: {
      autoplay: true,
      interval: 3000,
      showDots: true
    },
    animation: {
      type: 'slide',
      direction: 'left'
    }
  }
}

// 3D object viewer (future)
{
  type: 'content_ref',
  refId: '3d_model_789',
  transform: {
    component: 'ThreeJSViewer',
    props: {
      enableOrbitControls: true,
      autoRotate: true,
      lighting: 'studio'
    }
  }
}
```

### 3) Layout Management Integration

**Extend existing management pages**:
- `app/manage/page.tsx` - add "Layouts" tab alongside media assets
- `app/visual-search/page.tsx` - layouts appear in unified search results
- `app/file-manager/page.tsx` - layouts browsable like other media

**New layout-specific pages**:
- `app/blueprint-composer/page.tsx` - main authoring interface
- `app/blueprint-composer/[id]/page.tsx` - edit existing layout
- `app/layouts/[id]/preview/page.tsx` - full-screen layout preview

---

## Dependencies

### Install (Lightweight Stack)

```bash
# Core layout engine (bulletproof collision detection)
npm i react-grid-layout react-resizable react-draggable

# Form handling for block configuration
npm i react-hook-form @hookform/resolvers zod

# Rich text for inline text blocks
npm i @tiptap/react @tiptap/starter-kit @tiptap/extension-placeholder

# Color picker for styling
npm i react-colorful

# File upload for inline images
npm i react-dropzone

# Animation library for transforms (optional)
npm i framer-motion
```

### Remove (Collision Hell Dependencies)

```bash
# Delete the collision nightmare
npm uninstall @shopify/draggable

# Don't install GrapesJS (500KB+ bloat)
# npm i grapesjs  ← NO, we're building lightweight
```

### Bundle Size Comparison

```
Current (broken): @shopify/draggable + custom collision = ~150KB + bugs
Proposed: RGL + react-hook-form + optional TipTap = ~100KB + bulletproof
GrapesJS alternative: 500KB+ + heavy runtime + vendor lock-in
```

### SSR Safety

```tsx
// All layout-heavy components must be client-only
const CanvasBoardRGL = dynamic(() => import('./CanvasBoardRGL'), { ssr: false });
const BlueprintComposer = dynamic(() => import('./BlueprintComposer'), { ssr: false });
const TipTapEditor = dynamic(() => import('./TipTapEditor'), { ssr: false });
const ColorPicker = dynamic(() => import('react-colorful'), { ssr: false });

// Transform components (loaded dynamically based on transform.component)
const TransformComponents = {
  ScrollingText: dynamic(() => import('./transforms/ScrollingText'), { ssr: false }),
  ImageCarousel: dynamic(() => import('./transforms/ImageCarousel'), { ssr: false }),
  ThreeJSViewer: dynamic(() => import('./transforms/ThreeJSViewer'), { ssr: false }),
  // Add more as needed...
};
```

---

## Implementation Strategy

### Phase 1: RGL Canvas Swap (Week 1)
**Goal**: Replace collision nightmare with bulletproof RGL canvas

1. **Install dependencies**: `react-grid-layout`, `react-resizable`, `react-draggable`
2. **Create `CanvasBoardRGL.tsx`**: RGL-based canvas with `preventCollision={true}`
3. **Update `page.tsx`**: Switch dynamic import to `CanvasBoardRGL`
4. **Delete collision hell**: Remove `CanvasBoard.tsx`, `@shopify/draggable`, all manual collision code
5. **Test**: Verify no overlaps, smooth drag/resize, boundary respect

### Phase 2: Layout Asset Type (Week 2)
**Goal**: Full media asset integration for layouts

1. **Extend types**: Add `LayoutAsset` to `lib/media-storage.ts` and visual-search types
2. **Update APIs**: Extend `app/api/media-assets/` to handle `media_type: 'layout'`
3. **Canvas export**: Add "Export to Layout" button, implement canvas → LayoutAsset conversion
4. **Unified search**: Add `ContentType = 'layout'` to search filters
5. **Test**: Create/save/search layouts via existing media asset infrastructure

### Phase 3: Blueprint Composer (Week 3)
**Goal**: Lightweight page builder with inline content & transforms

1. **Install forms**: `react-hook-form`, `@hookform/resolvers`, `zod`
2. **Create composer**: `app/blueprint-composer/page.tsx` with RGL + enhanced block library
3. **Block catalog**: Hero, MediaGrid, TextSection, CTA, Footer + InlineText, InlineImage, ContentRef
4. **Global styling**: Layout-level theme, colors, typography, CSS configuration
5. **Inline content**: Direct text editing, lightweight image upload (stored in layout JSON)
6. **Transform system**: Generic component/animation system for display transforms
7. **Side panel config**: react-hook-form for block settings, styling, transforms
8. **HTML export**: Generate styled HTML with transforms from LayoutAsset JSON
9. **Test**: Create layouts with inline content, transforms, global styling

### Phase 4: 3D Spatial Prep (Week 4)
**Goal**: Normalized coordinates for R3F mapping

1. **Normalization**: Store both px and 0-1 coordinates in LayoutAsset
2. **R3F helpers**: Functions to convert normalized layout → world coordinates
3. **Spatial preview**: Basic R3F scene showing layout as textured planes
4. **Test**: 2D layout → 3D spatial arrangement with preserved relationships

## Canvas → Layout Conversion

```typescript
// Convert PinnedItem[] to LayoutAsset
function canvasToLayout(pinned: PinnedItem[], canvasSize: { width: number; height: number }): LayoutAsset {
  return {
    id: generateId(),
    filename: `canvas-export-${Date.now()}.json`,
    title: 'Canvas Export',
    media_type: 'layout',
    layout_type: 'canvas_export',
    layout: {
      designSize: canvasSize,
      cellSize: 20,
      items: pinned.map(p => ({
        id: p.id,
        type: 'content',
        refId: p.result.id,
        contentType: p.result.content_type,
        title: p.result.title,
        mediaUrl: getResultMediaUrl(p.result),
        snippet: buildSnippet(p.result),
        // Pixel coordinates
        x: p.x, y: p.y, w: p.width, h: p.height,
        // Normalized coordinates (0-1)
        nx: p.x / canvasSize.width,
        ny: p.y / canvasSize.height,
        nw: p.width / canvasSize.width,
        nh: p.height / canvasSize.height,
        z: p.z
      }))
    },
    // Standard asset fields...
  };
}
```

---

## 3D Spatial Mapping (R3F Integration)

### Normalized → World Coordinates

```typescript
// Convert normalized layout to R3F world positions
function layoutToR3F(layout: LayoutAsset['layout'], worldSize = { width: 4, height: 3 }): R3FLayout {
  return {
    worldSize,
    planes: layout.items.map(item => ({
      id: item.id,
      position: [
        -worldSize.width/2 + item.nx * worldSize.width + item.nw * worldSize.width/2,  // centerX
        worldSize.height/2 - item.ny * worldSize.height - item.nh * worldSize.height/2, // centerY
        (item.z || 0) * 0.01  // small Z offset for layering
      ] as [number, number, number],
      scale: [
        item.nw * worldSize.width,   // width
        item.nh * worldSize.height,  // height
        0.01                         // thin planes
      ] as [number, number, number],
      texture: item.mediaUrl,
      content: item.snippet,
      type: item.contentType
    }))
  };
}
```

### R3F Scene Structure

```tsx
// app/spatial-preview/[layoutId]/page.tsx
function SpatialPreview({ layoutId }: { layoutId: string }) {
  const layout = useLayoutAsset(layoutId);
  const r3fLayout = layoutToR3F(layout.layout);

  return (
    <Canvas camera={{ position: [0, 0, 5], fov: 60 }}>
      <ambientLight intensity={0.6} />
      <pointLight position={[10, 10, 10]} />

      {r3fLayout.planes.map(plane => (
        <LayoutPlane key={plane.id} {...plane} />
      ))}

      <OrbitControls enablePan enableZoom enableRotate />
    </Canvas>
  );
}
```

---

## Testing & QA Strategy

### Automated Tests

```typescript
// Canvas collision prevention
describe('CanvasBoardRGL', () => {
  it('prevents overlaps during fast drag operations', async () => {
    // Simulate rapid drag events
    // Verify no items occupy same grid cells
  });

  it('respects canvas boundaries', async () => {
    // Drag item to edge
    // Verify item stays within bounds
  });
});

// Layout conversion
describe('canvasToLayout', () => {
  it('preserves spatial relationships in normalized coordinates', () => {
    // Convert canvas with known layout
    // Verify normalized coordinates maintain relative positions
  });
});
```

### Manual QA Checklist

- [ ] **Canvas**: No overlaps under any drag/resize scenario
- [ ] **Canvas**: Smooth snapping to grid, no jitter
- [ ] **Canvas**: Modal height grows with content, outer scroll only
- [ ] **Export**: Canvas → Layout preserves all content and positions
- [ ] **Composer**: Block drag/drop works, side panel config saves
- [ ] **Composer**: HTML export renders correctly in browser
- [ ] **Search**: Layouts appear in unified search results
- [ ] **3D**: Normalized coordinates produce sensible spatial arrangements

---

## Rollout Strategy

### Feature Flags
```typescript
// lib/feature-flags.ts
export const FEATURE_FLAGS = {
  RGL_CANVAS: true,           // Phase 1: new canvas
  LAYOUT_ASSETS: true,        // Phase 2: layout asset type
  BLUEPRINT_COMPOSER: false,  // Phase 3: page builder
  SPATIAL_PREVIEW: false      // Phase 4: 3D preview
};
```

### Migration Plan
1. **Soft launch**: RGL canvas behind feature flag, A/B test vs old canvas
2. **Canvas migration**: Export existing canvas state to first Layout assets
3. **Full rollout**: Remove old canvas code, enable all layout features
4. **Cleanup**: Delete `CanvasBoard.tsx`, `@shopify/draggable`, collision utilities

### Risk Mitigation
- **SSR safety**: All layout components client-only with loading states
- **Bundle monitoring**: Track bundle size impact, lazy load heavy components
- **Performance**: Monitor RGL performance with large item counts
- **Data integrity**: Validate layout JSON schema on save/load

---

## Success Metrics

### Technical
- **Zero collision bugs**: No overlapping items under any interaction
- **Bundle size**: <150KB total for all layout features (vs 500KB+ GrapesJS)
- **Performance**: <100ms drag response time, <500ms layout save
- **SSR compatibility**: Clean server builds, no window/DOM errors

### User Experience
- **Canvas adoption**: Users prefer RGL canvas over old freeform
- **Layout creation**: Users successfully create and export layouts
- **3D mapping**: Spatial arrangements feel intuitive and preserve 2D relationships

### Business
- **Fast fashion pages**: Reduced time from concept to deployed page
- **Content reuse**: Layouts enable efficient content repurposing
- **3D readiness**: Foundation in place for spatial content experiences


