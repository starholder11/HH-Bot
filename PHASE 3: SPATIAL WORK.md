# PHASE 3: SPATIAL WORK
## Product Specification & Implementation Guide

---

## Executive Summary

Phase 3 introduces **Spaces** and **3D Objects** as first-class content types alongside Images, Videos, Layouts, and other media assets. This phase enables immersive 3D environments where users can navigate, explore, and manipulate both traditional media and complex 3D objects through direct spatial interaction.

This phase builds on our existing architecture by adding two new asset types:
- **Object Assets**: Discrete 3D models (atomic or composite) with hierarchical relationships
- **Object Collections**: Reusable groupings of objects that can be placed in layouts or spaces
- **Spaces**: 3D environments that can contain any media type including complex object hierarchies

**Key Innovation**: The same 3D content can exist in multiple contexts - object collections appear as flat icons in 2D layouts but render as full 3D models in spatial environments, with independent coordinate systems and versioned export/import workflows.

---

## Product Vision

### The Spatial & Object Experience

#### Traditional Media in 3D
Imagine a user working with a collection of vacation photos currently arranged in a 2D layout. They can convert this into a 3D gallery space where:

1. **2D layouts transform to 3D** - preserving spatial relationships but enabling 3D navigation
2. **Independent coordinate systems** - moving photos in the 3D space doesn't affect the original layout
3. **Versioned re-export** - can re-import the layout to update 3D positions with version history
4. **Cross-system flexibility** - same content optimized for both 2D web display and 3D exploration

#### Complex 3D Objects
Users can also work with sophisticated 3D object hierarchies:

1. **Atomic Objects** - Individual 3D models (chair, table, lamp) stored as discrete assets
2. **Composite Objects** - Multi-part objects (chair with separate seat, back, legs) with internal relationships
3. **Object Collections** - Reusable groupings (dining set = table + 4 chairs + lighting) that maintain spatial relationships
4. **Cross-Context Usage** - Same dining set appears as a flat icon in 2D layouts but renders as full 3D models in spatial environments
5. **Independent Positioning** - Collection can be positioned differently in layout vs space, coordinates remain independent

#### Unified Workflow
Whether working with photos, videos, or complex 3D furniture sets, users experience the same interaction patterns:
- **Direct insertion** into layouts or spaces
- **Independent coordinate systems** across different views
- **Reusable collections** that maintain relationships while allowing flexible positioning
- **Versioned workflows** for safe experimentation and rollback capabilities

### Core Value Propositions

**For Content Creators**
- Transform flat layouts into immersive experiences without technical complexity
- Explore large media collections through spatial navigation instead of endless scrolling
- Create engaging presentations and portfolios with spatial storytelling

**For Content Consumers**
- Experience media collections as navigable environments rather than static grids
- Discover content relationships through spatial proximity and grouping
- Interact with content in intuitive, game-like 3D interfaces

**For the Platform**
- Differentiate from traditional media management tools through spatial innovation
- Enable new content creation workflows that leverage 3D spatial relationships
- Provide foundation for future VR/AR experiences and collaborative workspaces

---

## User Experience Design

### Primary User Flows

#### Flow 1: Import Layout to Space (Manual Process)
```
Current Implementation: Manual workflow without agent

1. User Context: Working with existing 2D layout containing arranged photos
2. User Action: Clicks "Import to Space" button on layout
3. System Processing:
   - Analyzes 2D layout coordinates and content relationships
   - Converts to 3D floor positions preserving relative arrangements
   - Applies selected clustering algorithm (flat/clustered/elevated)
   - Generates 3D space asset with complete decoupling
4. User Preview: 3D space opens in viewer showing spatial arrangement
5. User Refinement: Uses manual editing tools to adjust positions
6. Final Result: Navigable 3D space saved as new media asset

Future Agent Integration:
- Natural language space creation requests
- Intelligent grouping suggestions
- Conversational refinement workflows
```

#### Flow 2: Create Space from Scratch (Manual Process)
```
Current Implementation: Manual creation workflow

1. User Context: Has collection of media assets, wants spatial organization
2. User Action: Clicks "Create New Space" → selects assets manually
3. System Processing:
   - Creates empty space with selected assets
   - Applies chosen spatial arrangement algorithm (grid/circle/timeline)
   - Positions items using manual arrangement tools
4. User Interaction: Uses 3D editor to arrange and organize content
5. Final Result: Custom space saved and accessible from media browser

Future Agent Integration:
- "Create a timeline space with my project videos"
- Automatic asset selection based on context
- Agent-suggested spatial arrangements
```

#### Flow 3: Manual Spatial Editing (Current Implementation)
```
User Journey: "I want to rearrange items in my gallery space"

1. User Context: Existing 3D gallery space open in viewer
2. User Action: Clicks "Edit Mode" button
3. System Response: Enables 3D transform controls and editing interface
4. User Interaction:
   - Uses TransformControls to grab and move items
   - Scales items using 3D handles or properties panel
   - Groups items by moving them close together
   - Adjusts lighting and environment settings via Leva panel
5. Real-time Updates: Changes immediately visible in 3D environment
6. Auto-save: Spatial arrangements automatically persist to space asset

Future Agent Integration:
- "Move that photo cluster to the left"
- "Group these videos together"
- Conversational editing commands
```

### Interaction Design Patterns

#### Spatial Navigation
- **Orbit Controls**: Mouse/trackpad to rotate around content, scroll to zoom
- **First-Person Mode**: WASD keys for walking through larger spaces
- **Teleportation**: Click to instantly move to different areas of the space
- **Minimap**: Overview showing user position and content locations

#### Content Manipulation
- **Grab and Move**: Click and drag to reposition items in 3D space
- **Scale Handles**: Corner handles for resizing content while maintaining aspect ratio
- **Rotation Gizmos**: Standard 3D rotation controls for precise orientation
- **Snap to Grid**: Optional grid snapping for precise alignment

#### Agent Integration (Future)
- **Conversational Overlay**: Chat interface accessible while in 3D space (Phase 4)
- **Spatial Commands**: "Move that photo to the left", "Group these videos together" (Phase 4)
- **Context Awareness**: Agent understands current camera position and selected items (Phase 4)
- **Preview Mode**: Agent shows proposed changes before applying them (Phase 4)

**Current Implementation**: Manual editing only with hooks prepared for future agent integration

### Responsive Design Considerations

#### Desktop Experience
- **Primary Interface**: Full 3D navigation with mouse and keyboard
- **Dual-Panel Layout**: 3D viewer + properties panel for detailed control
- **Keyboard Shortcuts**: Standard 3D software shortcuts (G for grab, R for rotate, S for scale)

#### Tablet Experience
- **Touch Navigation**: Pinch to zoom, drag to orbit, two-finger pan
- **Simplified Controls**: Larger touch targets, gesture-based manipulation
- **Context Menus**: Long-press for item-specific actions

#### Mobile Experience
- **Viewer Mode**: Primarily for viewing and basic navigation
- **Limited Editing**: Simple repositioning, no complex 3D manipulation
- **Agent-First**: Rely more heavily on conversational interface for changes

---

## Technical Architecture

### Data Model & Storage Architecture

#### JSON Storage Strategy

Spaces are stored as JSON documents in S3, following a structured schema that enables efficient querying, editing, and rendering. The JSON format provides several advantages:

- **Human-readable**: Easy to debug and inspect
- **Version-controllable**: Can track changes and maintain history
- **Flexible**: Schema can evolve without breaking existing spaces
- **Portable**: Can be exported/imported across systems
- **Cacheable**: Efficient client-side caching and synchronization

#### Storage Structure
```
S3 Bucket Organization:
spaces/
├── {spaceId}.json          # Primary space definition
├── {spaceId}_preview.jpg   # Generated preview thumbnail
├── {spaceId}_metadata.json # Search indexing metadata
└── versions/
    ├── {spaceId}_v1.json   # Version history (optional)
    ├── {spaceId}_v2.json
    └── ...
```

#### Object Asset Structure

```typescript
export type ObjectAsset = {
  // Standard media asset fields
  id: string;
  filename: string;                     // e.g., "dining-chair.glb" or "dining-set.json"
  title: string;
  description?: string;
  projectId?: string;

  // Object-specific metadata
  media_type: 'object';
  object_type: 'atomic' | 'composite';

  // Object definition
  object: {
    // Atomic objects (single 3D model)
    modelUrl?: string;                  // glTF/GLB file URL
    boundingBox: {
      min: [number, number, number];
      max: [number, number, number];
    };

    // Composite objects (multi-part assemblies)
    components?: Array<{
      id: string;                       // local component id
      objectId: string;                 // references another ObjectAsset
      transform: {
        position: [number, number, number];
        rotation: [number, number, number];
        scale: [number, number, number];
      };
      role: string;                     // "seat", "leg_front_left", "back"
      required: boolean;                // can this component be optional?
    }>;

    // Object metadata
    category: string;                   // "furniture", "appliance", "decoration", "architectural"
    subcategory?: string;               // "seating", "tables", "lighting"
    style?: string;                     // "modern", "rustic", "industrial"
    tags: string[];

    // Physical properties
    materials?: Array<{
      name: string;
      properties: Record<string, any>;  // PBR material properties
    }>;
    physics?: {
      mass?: number;
      friction?: number;
      restitution?: number;
    };
  };

  // Standard asset fields
  s3_url: string;                       // JSON or glTF storage
  cloudflare_url?: string;
  processing_status: {
    created: 'completed';
    model_processed: 'pending' | 'completed' | 'error';
    thumbnail: 'pending' | 'completed' | 'error';
  };
  timestamps: {
    created: string;
    updated: string;
    model_processed?: string;
  };
  created_at: string;
  updated_at: string;
};
```

#### Object Collection Structure

```typescript
export type ObjectCollection = {
  // Standard media asset fields
  id: string;
  filename: string;                     // e.g., "modern-dining-set.json"
  title: string;
  description?: string;
  projectId?: string;

  // Collection-specific metadata
  media_type: 'object_collection';
  collection_type: 'furniture_set' | 'room_kit' | 'scene' | 'custom';

  // Collection definition
  collection: {
    name: string;                       // "Modern Dining Set", "Kitchen Essentials"
    description?: string;

    // Objects in this collection (instances)
    objects: Array<{
      id: string;                       // local collection item id
      objectId: string;                 // references ObjectAsset
      transform: {
        position: [number, number, number];
        rotation: [number, number, number];
        scale: [number, number, number];
      };
      role: string;                     // "table", "chair_1", "chair_2", "centerpiece"
      quantity?: number;                // for repeated instances (rendered via instancing when possible)
      optional?: boolean;               // centerpiece is optional
    }>;

    // Nested collections (dining room contains dining set + lighting set)
    subCollections?: Array<{
      id: string;
      collectionId: string;             // references another ObjectCollection
      transform: {
        position: [number, number, number];
        rotation: [number, number, number];
        scale: [number, number, number];
      };
      role: string;
    }>;

    // Collection metadata
    category: string;                   // "dining", "bedroom", "office", "kitchen"
    style: string;                      // "modern", "rustic", "industrial"
    boundingBox: {                      // calculated from contents
      min: [number, number, number];
      max: [number, number, number];
    };

    // Relationship constraints (optional)
    constraints?: Array<{
      type: 'proximity' | 'alignment' | 'orientation';
      objects: string[];                // object IDs involved
      parameters: Record<string, any>;
    }>;

    // Versioning
    version?: number;                   // increment on material changes
  };

  // Standard asset fields
  s3_url: string;                       // JSON storage
  cloudflare_url?: string;
  processing_status: {
    created: 'completed';
    preview_generated: 'pending' | 'completed' | 'error';
    thumbnail: 'pending' | 'completed' | 'error';
  };
  timestamps: {
    created: string;
    updated: string;
    preview_generated?: string;
  };
  created_at: string;
  updated_at: string;
};
```

#### SpaceAsset Structure
```typescript
export type SpaceAsset = {
  // Standard media asset fields
  id: string;
  filename: string;                     // e.g., "gallery-room-1.json"
  title: string;
  description?: string;
  projectId?: string;

  // Space-specific metadata
  media_type: 'space';                  // New media type
  space_type: 'gallery' | 'timeline' | 'grid' | 'cluster' | 'custom';

  // Spatial configuration
  space: {
    // Environment settings
    environment: {
      backgroundColor?: string;
      lighting?: 'studio' | 'natural' | 'dramatic';
      fog?: { color: string; density: number };
      skybox?: string;                  // URL to skybox texture
    };

    // Camera defaults
    camera: {
      position: [number, number, number];
      target: [number, number, number];
      fov?: number;
      controls?: 'orbit' | 'first-person' | 'fly';
    };

        // Spatial items (references to any media asset type)
    items: Array<{
      id: string;                       // local space item id

      // Reference to existing media asset (now includes objects)
      assetId: string;                  // references any MediaAsset.id
      assetType: 'image' | 'video' | 'audio' | 'text' | 'layout' | 'canvas' | 'object' | 'object_collection';

      // 3D transform
      position: [number, number, number];
      rotation: [number, number, number];
      scale: [number, number, number];

      // Display properties
      opacity?: number;
      visible?: boolean;

      // Interaction properties
      clickable?: boolean;
      hoverEffect?: 'glow' | 'scale' | 'none';

      // Object-specific properties
      objectProperties?: {
        showComponents?: boolean;       // for composite objects
        interactionLevel?: 'collection' | 'object' | 'component';
        lodLevel?: number;              // level of detail
        physics?: {
          enabled: boolean;
          kinematic?: boolean;
        };
      };

      // Grouping
      groupId?: string;                 // for clustering related items

      // Version tracking (for layout imports)
      importMetadata?: {
        sourceType: 'layout' | 'manual';
        sourceId?: string;              // original layout ID if imported
        importVersion?: number;         // version of import
        importTimestamp?: string;
        originalTransform?: {
          position: [number, number, number];
          rotation: [number, number, number];
          scale: [number, number, number];
        };
      };
    }>;

    // Spatial relationships and constraints
    relationships?: Array<{
      from: string;                     // item id
      to: string;                       // item id
      type: 'maintain-distance' | 'align' | 'orbit' | 'follow';
      value?: number;
      enabled?: boolean;
    }>;

    // Spatial zones for organization
    zones?: Array<{
      id: string;
      name: string;
      bounds: {
        min: [number, number, number];
        max: [number, number, number];
      };
      properties?: {
        backgroundColor?: string;
        label?: string;
      };
    }>;
  };

  // Standard asset fields
  s3_url: string;                       // JSON storage
  cloudflare_url?: string;              // CDN if available
  processing_status: {
    created: 'completed';
    spatial_preview: 'pending' | 'completed' | 'error';
    thumbnail: 'pending' | 'completed' | 'error';
  };
  timestamps: {
    created: string;
    updated: string;
    spatial_preview_generated?: string;
  };
  created_at: string;
  updated_at: string;

  // Versioning metadata
  version?: number;                     // increments on structural changes
  sourceMappings?: Array<{
    sourceType: 'layout';               // currently only layouts map in
    sourceId: string;                   // layout id
    layoutItemId: string;               // original layout item id
    spaceItemId: string;                // current space item id
    importVersion: number;              // import version applied
  }>;
};
```

### Validation Schemas (Zod)

```typescript
import { z } from 'zod';

export const TransformZ = z.object({
  position: z.tuple([z.number(), z.number(), z.number()]),
  rotation: z.tuple([z.number(), z.number(), z.number()]),
  scale: z.tuple([z.number(), z.number(), z.number()])
});

export const ObjectAssetZ = z.object({
  id: z.string(),
  filename: z.string(),
  title: z.string(),
  description: z.string().optional(),
  projectId: z.string().optional(),
  media_type: z.literal('object'),
  object_type: z.union([z.literal('atomic'), z.literal('composite')]),
  object: z.object({
    modelUrl: z.string().url().optional(),
    boundingBox: z.object({
      min: z.tuple([z.number(), z.number(), z.number()]),
      max: z.tuple([z.number(), z.number(), z.number()])
    }),
    components: z
      .array(
        z.object({
          id: z.string(),
          objectId: z.string(),
          transform: TransformZ,
          role: z.string(),
          required: z.boolean()
        })
      )
      .optional(),
    category: z.string(),
    subcategory: z.string().optional(),
    style: z.string().optional(),
    tags: z.array(z.string()),
    materials: z
      .array(
        z.object({
          name: z.string(),
          properties: z.record(z.any())
        })
      )
      .optional(),
    physics: z
      .object({ mass: z.number().optional(), friction: z.number().optional(), restitution: z.number().optional() })
      .optional()
  }),
  s3_url: z.string(),
  cloudflare_url: z.string().optional(),
  processing_status: z.object({
    created: z.literal('completed'),
    model_processed: z.union([z.literal('pending'), z.literal('completed'), z.literal('error')]),
    thumbnail: z.union([z.literal('pending'), z.literal('completed'), z.literal('error')])
  }),
  timestamps: z.object({
    created: z.string(),
    updated: z.string(),
    model_processed: z.string().optional()
  }),
  created_at: z.string(),
  updated_at: z.string()
});

export const ObjectCollectionZ = z.object({
  id: z.string(),
  filename: z.string(),
  title: z.string(),
  description: z.string().optional(),
  projectId: z.string().optional(),
  media_type: z.literal('object_collection'),
  collection_type: z.union([z.literal('furniture_set'), z.literal('room_kit'), z.literal('scene'), z.literal('custom')]),
  collection: z.object({
    name: z.string(),
    description: z.string().optional(),
    objects: z.array(
      z.object({
        id: z.string(),
        objectId: z.string(),
        transform: TransformZ,
        role: z.string(),
        quantity: z.number().int().positive().optional(),
        optional: z.boolean().optional()
      })
    ),
    subCollections: z
      .array(
        z.object({
          id: z.string(),
          collectionId: z.string(),
          transform: TransformZ,
          role: z.string()
        })
      )
      .optional(),
    category: z.string(),
    style: z.string(),
    boundingBox: z.object({
      min: z.tuple([z.number(), z.number(), z.number()]),
      max: z.tuple([z.number(), z.number(), z.number()])
    }),
    constraints: z
      .array(
        z.object({
          type: z.union([z.literal('proximity'), z.literal('alignment'), z.literal('orientation')]),
          objects: z.array(z.string()),
          parameters: z.record(z.any())
        })
      )
      .optional(),
    version: z.number().int().nonnegative().optional()
  }),
  s3_url: z.string(),
  cloudflare_url: z.string().optional(),
  processing_status: z.object({
    created: z.literal('completed'),
    preview_generated: z.union([z.literal('pending'), z.literal('completed'), z.literal('error')]),
    thumbnail: z.union([z.literal('pending'), z.literal('completed'), z.literal('error')])
  }),
  timestamps: z.object({ created: z.string(), updated: z.string(), preview_generated: z.string().optional() }),
  created_at: z.string(),
  updated_at: z.string()
});

export const SpaceItemZ = z.object({
  id: z.string(),
  assetId: z.string(),
  assetType: z.union([
    z.literal('image'),
    z.literal('video'),
    z.literal('audio'),
    z.literal('text'),
    z.literal('layout'),
    z.literal('canvas'),
    z.literal('object'),
    z.literal('object_collection')
  ]),
  position: z.tuple([z.number(), z.number(), z.number()]),
  rotation: z.tuple([z.number(), z.number(), z.number()]),
  scale: z.tuple([z.number(), z.number(), z.number()]),
  opacity: z.number().optional(),
  visible: z.boolean().optional(),
  clickable: z.boolean().optional(),
  hoverEffect: z.union([z.literal('glow'), z.literal('scale'), z.literal('none')]).optional(),
  objectProperties: z
    .object({
      showComponents: z.boolean().optional(),
      interactionLevel: z.union([z.literal('collection'), z.literal('object'), z.literal('component')]).optional(),
      lodLevel: z.number().int().nonnegative().optional(),
      physics: z.object({ enabled: z.boolean(), kinematic: z.boolean().optional() }).optional()
    })
    .optional(),
  groupId: z.string().optional(),
  importMetadata: z
    .object({
      sourceType: z.union([z.literal('layout'), z.literal('manual')]),
      sourceId: z.string().optional(),
      importVersion: z.number().int().nonnegative().optional(),
      importTimestamp: z.string().optional(),
      originalTransform: TransformZ.optional()
    })
    .optional()
});

export const SpaceAssetZ = z.object({
  id: z.string(),
  filename: z.string(),
  title: z.string(),
  description: z.string().optional(),
  projectId: z.string().optional(),
  media_type: z.literal('space'),
  space_type: z.union([z.literal('gallery'), z.literal('timeline'), z.literal('grid'), z.literal('cluster'), z.literal('custom')]),
  space: z.object({
    environment: z.object({
      backgroundColor: z.string().optional(),
      lighting: z.union([z.literal('studio'), z.literal('natural'), z.literal('dramatic')]).optional(),
      fog: z.object({ color: z.string(), density: z.number() }).optional(),
      skybox: z.string().optional()
    }),
    camera: z.object({ position: z.tuple([z.number(), z.number(), z.number()]), target: z.tuple([z.number(), z.number(), z.number()]), fov: z.number().optional(), controls: z.union([z.literal('orbit'), z.literal('first-person'), z.literal('fly')]).optional() }),
    items: z.array(SpaceItemZ),
    relationships: z
      .array(
        z.object({
          from: z.string(),
          to: z.string(),
          type: z.union([z.literal('maintain-distance'), z.literal('align'), z.literal('orbit'), z.literal('follow')]),
          value: z.number().optional(),
          enabled: z.boolean().optional()
        })
      )
      .optional(),
    zones: z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          bounds: z.object({ min: z.tuple([z.number(), z.number(), z.number()]), max: z.tuple([z.number(), z.number(), z.number()]) }),
          properties: z.object({ backgroundColor: z.string().optional(), label: z.string().optional() }).optional()
        })
      )
      .optional()
  }),
  s3_url: z.string(),
  cloudflare_url: z.string().optional(),
  processing_status: z.object({
    created: z.literal('completed'),
    spatial_preview: z.union([z.literal('pending'), z.literal('completed'), z.literal('error')]),
    thumbnail: z.union([z.literal('pending'), z.literal('completed'), z.literal('error')])
  }),
  timestamps: z.object({ created: z.string(), updated: z.string(), spatial_preview_generated: z.string().optional() }),
  created_at: z.string(),
  updated_at: z.string(),
  version: z.number().int().nonnegative().optional(),
  sourceMappings: z
    .array(
      z.object({
        sourceType: z.literal('layout'),
        sourceId: z.string(),
        layoutItemId: z.string(),
        spaceItemId: z.string(),
        importVersion: z.number().int().nonnegative()
      })
    )
    .optional()
});
```

### Cross-System Integration Workflows

#### Objects and Collections in Layouts

When objects or collections are added to layouts, they are represented as 2D icons with metadata:

```typescript
// Enhanced LayoutAsset to support objects
type LayoutAsset = {
  layout: {
    items: Array<{
      // ... existing layout item fields

      // Enhanced for object support
      assetType: 'image' | 'video' | 'audio' | 'text' | 'object' | 'object_collection';

      // Object-specific layout properties
      objectLayoutProperties?: {
        iconUrl: string;                // 2D representation for layout view
        previewUrl?: string;            // optional 3D preview thumbnail
        boundingBox2D: {                // 2D footprint for layout positioning
          width: number;
          height: number;
        };
        showLabel: boolean;             // display object name in layout
      };
    }>;
  };
}
```

#### Independent Coordinate Systems & Versioned Workflows

Each system maintains its own coordinate space with versioned export/import:

```typescript
// Layout coordinates (2D pixel-based)
const layoutItem = {
  x: 120,      // pixels from left
  y: 80,       // pixels from top
  w: 300,      // width in pixels
  h: 200       // height in pixels
};

// Space coordinates (3D world units) - INDEPENDENT
const spaceItem = {
  position: [-8.5, 0.1, -3.2],  // world units
  rotation: [0, 0.785, 0],       // radians
  scale: [2.1, 1.4, 1]           // scale factors
};

// Versioned re-export workflow
async function reExportLayoutToSpace(
  layoutId: string,
  spaceId: string,
  options: { createVersion: boolean }
): Promise<SpaceAsset> {

  if (options.createVersion) {
    // Create backup version of current space
    const currentSpace = await getSpaceAsset(spaceId);
    await createSpaceVersion(currentSpace);
  }

  // Fetch source layout
  const layout = await getLayoutAsset(layoutId);

  // Re-export with new coordinates (overwrites space positions)
  const updatedSpace = await exportLayoutToSpace(layout, {
    targetSpaceId: spaceId,
    preserveNonLayoutItems: true,  // keep manually added items
    updateImportVersion: true      // increment version number
  });

  return updatedSpace;
}
```

#### Layout-to-Space Import Mapping

When importing a 2D layout into a 3D space, we create a **complete decoupling** between the original layout and the new space. This ensures that:

1. **Original layout remains unchanged** - modifications to the space don't affect the source layout
2. **Space becomes independent** - can be radically edited without constraints
3. **Referential integrity maintained** - space items still reference original media assets
4. **Transformation history preserved** - can track how space derived from layout

##### Coordinate Transformation Process

```typescript
interface LayoutImportConfig {
  layoutId: string;
  spaceTitle: string;
  floorSize: number;        // 3D floor dimensions (e.g., 20x20 units)
  itemHeight: number;       // Default height for 2D items (e.g., 0.1 units)
  groupingStrategy: 'flat' | 'clustered' | 'elevated';
  preserveAspectRatio: boolean;
}

interface TransformationResult {
  spaceItems: SpaceItem[];
  transformationMatrix: Matrix4;
  originalBounds: { width: number; height: number };
  scaleFactor: number;
}

function importLayoutToSpace(layout: LayoutAsset, config: LayoutImportConfig): TransformationResult {
  const { designSize, items } = layout.layout;
  const { floorSize, itemHeight, groupingStrategy } = config;

  // Step 1: Calculate scaling to fit layout onto 3D floor
  const scaleFactor = Math.min(
    floorSize / designSize.width,
    floorSize / designSize.height
  );

  // Step 2: Transform each layout item to 3D space coordinates
  const spaceItems = items.map((item, index) => {
    // Normalize 2D coordinates (0-1)
    const normalizedX = item.x / designSize.width;
    const normalizedY = item.y / designSize.height;

    // Map to 3D floor space (centered around origin)
    const x3D = (normalizedX - 0.5) * floorSize;
    const z3D = (normalizedY - 0.5) * floorSize;  // Y becomes Z (floor depth)
    const y3D = itemHeight;  // Start slightly above floor

    // Calculate 3D scale based on original 2D dimensions
    const scaleX = (item.w / designSize.width) * floorSize * 0.1; // Scale down for 3D
    const scaleY = (item.h / designSize.height) * floorSize * 0.1;

    return {
      id: `space_item_${item.id}_${index}`,

      // Reference original media asset (DECOUPLED from layout)
      assetId: item.refId || item.id,
      assetType: item.contentType,

      // 3D transform (completely independent of original layout)
      position: [x3D, y3D, z3D] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      scale: [scaleX, scaleY, 1] as [number, number, number],

      // Preserve display properties
      opacity: item.opacity || 1,
      visible: true,

      // Import metadata (for tracking purposes only)
      importMetadata: {
        originalLayoutId: layout.id,
        originalItemId: item.id,
        originalPosition: { x: item.x, y: item.y },
        originalDimensions: { w: item.w, h: item.h },
        importTimestamp: new Date().toISOString()
      }
    };
  });

  // Step 3: Apply grouping strategy
  const processedItems = applyGroupingStrategy(spaceItems, groupingStrategy);

  return {
    spaceItems: processedItems,
    transformationMatrix: createTransformationMatrix(scaleFactor, floorSize),
    originalBounds: { width: designSize.width, height: designSize.height },
    scaleFactor
  };
}

function applyGroupingStrategy(items: SpaceItem[], strategy: string): SpaceItem[] {
  switch (strategy) {
    case 'flat':
      return items; // No additional processing

    case 'clustered':
      return applyClusterGrouping(items);

    case 'elevated':
      return applyElevationGrouping(items);

    default:
      return items;
  }
}

function applyClusterGrouping(items: SpaceItem[]): SpaceItem[] {
  // Group items by proximity and elevate clusters
  const clusters = clusterByProximity(items, 3.0); // 3 unit radius

  return clusters.flatMap((cluster, clusterIndex) => {
    return cluster.map((item, itemIndex) => ({
      ...item,
      position: [
        item.position[0],
        item.position[1] + (itemIndex * 0.5), // Stack items vertically
        item.position[2] + (clusterIndex * 0.2) // Slight Z offset per cluster
      ] as [number, number, number],
      groupId: `cluster_${clusterIndex}`
    }));
  });
}

function clusterByProximity(items: SpaceItem[], radius: number): SpaceItem[][] {
  const clusters: SpaceItem[][] = [];
  const used = new Set<string>();

  items.forEach(item => {
    if (used.has(item.id)) return;

    const cluster = [item];
    used.add(item.id);

    items.forEach(other => {
      if (used.has(other.id)) return;

      const distance = Math.sqrt(
        Math.pow(item.position[0] - other.position[0], 2) +
        Math.pow(item.position[2] - other.position[2], 2)
      );

      if (distance <= radius) {
        cluster.push(other);
        used.add(other.id);
      }
    });

    clusters.push(cluster);
  });

  return clusters;
}
```

##### Decoupling Guarantees

1. **No Bidirectional References**: Space items reference media assets directly, not through layout
2. **Independent Transforms**: All 3D positioning data stored separately from layout coordinates
3. **Immutable Import Metadata**: Original layout relationship preserved for audit/history only
4. **Separate Storage**: Space JSON stored independently from layout JSON
5. **Version Independence**: Layout updates don't trigger space updates and vice versa

##### Example Import Result

```json
{
  "id": "space_abc123",
  "title": "Imported Gallery Space",
  "media_type": "space",
  "space": {
    "importMetadata": {
      "sourceLayoutId": "layout_xyz789",
      "importTimestamp": "2024-01-15T10:30:00Z",
      "transformationMatrix": [1.5, 0, 0, 0, 0, 1.5, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      "originalBounds": { "width": 1440, "height": 1024 },
      "scaleFactor": 0.0139
    },
    "items": [
      {
        "id": "space_item_photo1_0",
        "assetId": "media_photo_001",  // Direct reference to media asset
        "assetType": "image",
        "position": [-8.5, 0.1, -3.2],
        "rotation": [0, 0, 0],
        "scale": [2.1, 1.4, 1],
        "groupId": "cluster_0",
        "importMetadata": {
          "originalLayoutId": "layout_xyz789",
          "originalItemId": "layout_item_1",
          "originalPosition": { "x": 120, "y": 80 },
          "originalDimensions": { "w": 300, "h": 200 }
        }
      }
    ]
  }
}
```

### 2D → 3D Mapping: Formulas and Test Vectors (Specific to Existing Layouts)

#### Mapping Assumptions
- Layout coordinates are pixel-based with origin at top-left: `(x, y, w, h)` within `designSize { width: Wpx, height: Hpx }`.
- Space is Y-up, right-handed. X = horizontal (left/right), Z = depth (forward/back). Y = vertical.
- World floor spans `{ width: Wm, depth: Dm }` meters. Default preserves aspect: `Dm = Wm * (Hpx / Wpx)`.
- Imported layout items are laid flat on the floor at small `baseHeightMeters` (e.g., `0.1`), with thin thickness (e.g., `0.01`). If using `PlaneGeometry` (XY plane), apply `rotationX = -Math.PI / 2`.

#### Formulas (pixel inputs)
Given item rect `(x, y, w, h)`:
- Center in pixels: `cx = x + w / 2`, `cy = y + h / 2`
- Normalized center: `nx = cx / Wpx`, `ny = cy / Hpx`
- World position:
  - `posX = (nx - 0.5) * Wm`
  - `posZ = (0.5 - ny) * Dm`  // invert Y because layout Y grows downward
  - `posY = baseHeightMeters`
- World scale (footprint on floor):
  - `scaleX = (w / Wpx) * Wm`
  - `scaleZ = (h / Hpx) * Dm`
  - `scaleY = thicknessMeters` (e.g., `0.01`)

If normalized fields exist on items (`nx, ny, nw, nh`):
- `posX = ((nx + nw / 2) - 0.5) * Wm`
- `posZ = (0.5 - (ny + nh / 2)) * Dm`
- `scaleX = nw * Wm`, `scaleZ = nh * Dm`

#### Test Vectors (Golden Values)

Case A: Centered item in 1440×1024 layout, preserve aspect
- Inputs: `Wpx = 1440`, `Hpx = 1024`, `Wm = 20`, `Dm = 20 * (1024 / 1440) = 14.222222...`
- Item: 20% × 20% centered → `w = 288`, `h = 205` (≈ 204.8), `x = (1440 - 288)/2 = 576`, `y = (1024 - 205)/2 = 409.5`
- Expected:
  - `pos = [0, 0.1, 0]`
  - `scale = [4.0, 0.01, 2.844444...]`

Case B: Top-left 10% tile
- Inputs: same `Wpx, Hpx, Wm, Dm`
- Item: `w = 144`, `h = 102`, `x = 0`, `y = 0`
- Intermediate: `nx = 72/1440 = 0.05`, `ny = 51/1024 = 0.0498046875`
- Expected:
  - `posX = (0.05 - 0.5) * 20 = -9`
  - `posZ = (0.5 - 0.0498046875) * 14.222222... ≈ 6.40278`
  - `scale = [2.0, 0.01, (102/1024)*14.222222... ≈ 1.41667]`

Case C: Bottom-right 10% tile (mirror of B)
- Item: `w = 144`, `h = 102`, `x = 1296`, `y = 922`
- Intermediate: `nx = 0.95`, `ny = 0.9501953125`
- Expected:
  - `pos = [9, 0.1, -6.40278]`
  - `scale = [2.0, 0.01, 1.41667]`

Case D: Non-square layout 1920×1080, 25% centered, aspect-preserved floor
- Inputs: `Wpx = 1920`, `Hpx = 1080`, `Wm = 20`, `Dm = 20 * (1080/1920) = 11.25`
- Item: `w = 480`, `h = 270`, `x = 720`, `y = 405`
- Expected:
  - `pos = [0, 0.1, 0]`
  - `scale = [5.0, 0.01, 2.8125]`

Case E: Banner in wide layout 2000×500
- Inputs: `Wpx = 2000`, `Hpx = 500`, `Wm = 20`, `Dm = 5`
- Item: full-width banner `w = 2000`, `h = 100`, `x = 0`, `y = 0`
- Center: `nx = 0.5`, `ny = 0.1`
- Expected:
  - `pos = [0, 0.1, (0.5 - 0.1) * 5 = 2]`
  - `scale = [20, 0.01, 1]`

Notes:
- All positions/scales are in meters; round to 1e-3 in tests to avoid FP precision flakiness.
- If importing as vertical panels instead of floor tiles, omit `rotationX = -PI/2` and map `scaleZ` to thickness with `scaleY` as height.


### Conventions and Policies

#### Units and Coordinate Conventions
- World units: meters
- Axes: Y-up, right-handed coordinate system
- Rotations: radians
- Layout coordinates: pixel-based (origin top-left), Space coordinates: world meters (origin center by default)
- Documented conversions: all 2D→3D mapping functions must use the above conventions

#### Versioning Model
- `ObjectAsset`, `ObjectCollection`, `SpaceAsset`, and `LayoutAsset` maintain immutable `id` and mutable content with version metadata
- Spaces store `importMetadata` with `sourceId` and `importVersion` per imported item
- Re-export from layout increments `importVersion` and writes a new Space version; previous Space versions are stored under `spaces/versions/`
- Layout re-export updates only items mapped to that layout; manually added/edited Space items remain unchanged unless explicitly opted-in

#### Deletion and Reference Policy
- Assets referenced by other assets cannot be hard-deleted; they become tombstoned (soft-deleted) with a migration path
- UI must surface references (e.g., “Used in 3 Spaces and 2 Collections”) before deletion
- Collections referencing missing objects display a clear error and offer replacement/removal

#### glTF Ingestion Policy
- Canonical 3D format: glTF 2.0 (GLB)
- Compression: Draco (geometry) and KTX2/UASTC (textures) required when available
- Validation gates: polygon count caps, texture size caps, material compatibility (PBR metallic‑roughness)
- Automated preview generation: thumbnail and optional turntable for icons

#### Instancing and Reuse
- Repeated objects in `ObjectCollection` should render using GPU instancing (`THREE.InstancedMesh`) where feasible
- `quantity` in collections is syntactic sugar for N instances; implementation should materialize per-instance transforms deterministically (e.g., circular or grid distribution helpers)

#### Constraints (Initial Set)
- Supported: `align`, `maintain-distance`, `snap-to-surface`
- Conflict policy: last-applied constraint wins; manual transform overrides constraints until re-apply
- Solver: lightweight iterative solver; defer physics-based constraints to future phase

#### Search and Indexing
- Index object metadata (category, style, tags), collection membership, and usage graph (which Spaces/Layouts reference which assets)
- Expose filters in Unified Search for `object`, `object_collection`, and `space`

#### Editor Embed Security
- `postMessage` bridge restricts allowed origins; all payloads validated against schemas
- Scene JSON sanitized; no executable scripts or unsafe URLs

#### Access Control (Single User Now, Multi-User Ready)
- Single-user mode: full access
- Multi-user readiness: plan RBAC for shared objects/collections; copy-on-write semantics for edits in downstream Spaces

### Technology Stack

#### Core 3D Rendering
- **React Three Fiber (R3F)**: Declarative 3D rendering with React component model
- **Three.js**: Underlying WebGL engine with proven performance and ecosystem
- **@react-three/drei**: Essential helpers (controls, loaders, effects)
- **@react-three/postprocessing**: Visual effects and post-processing pipeline

#### State Management
- **Zustand**: Lightweight state management with selective subscriptions
- **React Query**: Server state management and caching for media assets
- **Redis**: Session context and spatial state persistence (existing)

#### Performance Optimization
- **@react-three/fiber**: Built-in frustum culling and LOD support
- **drei/useTexture**: Efficient texture loading and caching
- **Web Workers**: Background processing for spatial calculations
- **IndexedDB**: Client-side caching for frequently accessed spaces

#### 3D Editor Integration

Rather than building a 3D editor from scratch, we integrate existing proven solutions:

**Primary Editor: Three.js Editor (Embedded)**
- **Official Three.js Editor**: Mature, full-featured 3D scene editor
- **Embedding Strategy**: Load as iframe with postMessage communication bridge
- **Custom Integration**: Extend with our space-specific features and workflows
- **File Format**: Native Three.js JSON scene format with our extensions

**Secondary Editor Components: React Three Fiber Native**
- **@react-three/drei TransformControls**: 3D manipulation gizmos (move, rotate, scale)
- **@react-three/drei PivotControls**: Alternative manipulation interface for power users
- **Leva**: Real-time parameter tweaking and properties panel
- **Custom Space Controls**: Space-specific editing tools built on R3F

**Hybrid Approach Benefits**:
- **Rapid Development**: Leverage mature editor instead of building from scratch
- **Full Feature Set**: Access to complete 3D editing capabilities
- **Custom Extensions**: Add space-specific features on top of proven foundation
- **Fallback Options**: Multiple editing interfaces for different user preferences

#### Development Tools
- **drei/Stats**: Performance monitoring and debugging
- **drei/Grid**: Visual grid helpers for spatial alignment
- **drei/Helper**: Visual debugging aids for development

### Component Architecture

#### High-Level Structure
```
SpaceViewer (main container)
├── SpaceCanvas (R3F Canvas wrapper)
│   ├── SpaceScene (3D scene management)
│   │   ├── SpaceEnvironment (lighting, skybox, fog)
│   │   ├── SpaceItems (media content rendering)
│   │   │   └── SpaceItem (individual media item)
│   │   └── SpaceZones (spatial organization areas)
│   ├── SpaceControls (camera and navigation)
│   └── SpaceEffects (post-processing)
├── SpaceUI (overlay interface)
│   ├── NavigationControls
│   ├── ItemProperties
│   └── AgentChat
└── SpaceEditor (editing mode)
    ├── TransformControls
    ├── PropertyPanel
    └── HierarchyView
```

#### Key Components

**SpaceItem Component**
```typescript
const SpaceItem = ({ item, isSelected, onSelect, onTransform }) => {
  const asset = useMediaAsset(item.assetId);
  const texture = useTexture(asset.url);
  const [hovered, setHovered] = useState(false);

  // LOD based on camera distance
  const distance = useCameraDistance(item.position);
  const quality = useMemo(() => {
    if (distance > 30) return 'icon';      // 64x64px
    if (distance > 15) return 'thumbnail'; // 256x256px
    if (distance > 8) return 'preview';    // 512x512px
    return 'standard';                     // 1024x1024px
  }, [distance]);

  const textureUrl = `${asset.url}?w=${getWidthForQuality(quality)}`;

  return (
    <group
      position={item.position}
      rotation={item.rotation}
      scale={item.scale}
      onClick={onSelect}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      <mesh>
        <planeGeometry args={[2, 2]} />
        <meshBasicMaterial
          map={useTexture(textureUrl)}
          transparent
          opacity={item.opacity || 1}
        />
      </mesh>

      {hovered && item.hoverEffect === 'glow' && (
        <mesh>
          <planeGeometry args={[2.2, 2.2]} />
          <meshBasicMaterial color="#ffffff" opacity={0.3} transparent />
        </mesh>
      )}

      {isSelected && <SelectionOutline />}
    </group>
  );
};
```

**SpaceControls Component**
```typescript
const SpaceControls = ({ space, onCameraChange }) => {
  const { camera } = useThree();
  const controlsRef = useRef();

  // Switch between control modes based on space type
  const ControlComponent = useMemo(() => {
    switch (space.camera.controls) {
      case 'first-person': return FirstPersonControls;
      case 'fly': return FlyControls;
      default: return OrbitControls;
    }
  }, [space.camera.controls]);

  return (
    <ControlComponent
      ref={controlsRef}
      target={space.camera.target}
      enablePan={true}
      enableZoom={true}
      enableRotate={true}
      minDistance={2}
      maxDistance={100}
      onChange={onCameraChange}
    />
  );
};
```

### Performance Architecture

#### Level of Detail (LOD) System
- **Distance-based quality**: Automatically reduce texture resolution for distant items
- **Frustum culling**: Only render items visible to camera
- **Occlusion culling**: Hide items blocked by other objects
- **Batch rendering**: Group similar items for efficient GPU utilization

#### Memory Management
- **Texture disposal**: Automatically cleanup textures for distant/hidden items
- **Asset streaming**: Load high-quality assets only when needed
- **Garbage collection**: Proactive cleanup of unused 3D objects
- **Memory monitoring**: Track usage and trigger cleanup when limits approached

#### Spatial Indexing
- **Octree structure**: Efficient spatial queries for large item collections
- **Viewport culling**: Only process items within camera view
- **Proximity queries**: Fast neighbor finding for grouping operations
- **Collision detection**: Efficient overlap detection for placement algorithms

#### Preview and Icon Generation
- **Object icons**: Generated from canonical camera angle against neutral background
- **3D previews**: Optional turntable animation for collections and complex objects
- **Caching**: Previews stored alongside JSON in S3 and CDN-distributed
- **Fallbacks**: Placeholder icons for missing/invalid models

#### Reference Model Library (for development)
- Location: `public/models/reference/threejs`
- Available models (GLB):
  - `DamagedHelmet.glb`
  - `BoomBox.glb`
  - `Lantern.glb`
  - `Duck.glb`
  - `Sponza.glb` (scene)
- Usage (React Three Fiber):
  - `const { scene } = useGLTF('/models/reference/threejs/DamagedHelmet.glb')`
  - Render as `<primitive object={scene} />`
- Purpose: baseline assets for loader/rendering validation, editor testing, and performance profiling while object ingestion is implemented
- Notes: these are canonical Three.js sample models suitable for quick bring-up; furniture packs (e.g., Quaternius/Kenney) can be added later under `public/models/reference/furniture/`

---

## Agent Integration (Hooks Only - Implementation Later)

**Important**: This section describes the agentic integration architecture that will be implemented in **Phase 4** (after manual editor completion). During the current implementation phases, we only put the **hooks and infrastructure** in place to support future agent integration.

### Tool Registry Integration (Hooks Only)

#### Auto-Generated API Tools (Prepared for Discovery)
The existing tool factory will automatically discover and generate tools for:
- `POST /api/spaces` → `createSpace` tool (basic CRUD only)
- `GET /api/spaces/[id]` → `getSpace` tool
- `PUT /api/spaces/[id]` → `updateSpace` tool
- `DELETE /api/spaces/[id]` → `deleteSpace` tool

**Current Implementation**: Ensure API endpoints follow existing patterns for tool auto-discovery
**Future Implementation**: Full agent workflow integration

#### Custom Spatial Workflow Tools (Placeholder Only)

**Current Implementation**: Create empty placeholder tools that return "not implemented" errors:

```typescript
// lib/tools/spatial-workflows.ts (PLACEHOLDER ONLY)
export const spatialWorkflowTools = {
  createSpaceFromAssets: {
    description: "Create a 3D space from a collection of media assets",
    parameters: {
      title: { type: "string" },
      assetIds: { type: "array", items: { type: "string" }},
      arrangement: { type: "string", enum: ["grid", "circle", "timeline", "cluster"] }
    },
    execute: async () => {
      throw new Error("Spatial workflow tools not yet implemented - manual editor first");
    }
  },

  importLayoutToSpace: {
    description: "Convert a 2D layout into a 3D space with intelligent grouping",
    parameters: {
      layoutId: { type: "string" },
      title: { type: "string" },
      groupingStyle: { type: "string", enum: ["flat", "clustered", "elevated"] }
    },
    execute: async () => {
      throw new Error("Layout import workflow not yet implemented - manual editor first");
    }
  }

  // Additional placeholder tools...
};
```

**Future Implementation**: Full workflow orchestration with LangGraph integration

#### UI Action Tools (Infrastructure Only)

**Current Implementation**: Set up the infrastructure for UI actions without agent integration:

```typescript
// lib/tools/spatial-ui-actions.ts (INFRASTRUCTURE ONLY)
export const spatialUITools = {
  openSpaceViewer: {
    description: "Open a space in the 3D viewer",
    parameters: { spaceId: { type: "string" } },
    execute: async (spaceId) => {
      // Direct navigation for now, agent integration later
      window.location.href = `/spaces/${spaceId}`;
    }
  }

  // Additional UI action infrastructure...
};
```

### Context Management (Hooks Only)

#### Spatial Context Infrastructure

**Current Implementation**: Set up context management hooks without agent integration:

```typescript
// lib/context/spatial-context.ts (HOOKS ONLY)
export class SpatialContextManager {
  // Prepare context structure for future agent integration
  async prepareSpatialContext(spaceId: string) {
    return {
      currentSpace: { id: spaceId },
      selectedItems: [],
      cameraPosition: [0, 0, 0],
      recentOperations: [],
      // Structure ready for agent integration
    };
  }

  // Hook for future agent parameter injection
  async enrichSpatialContext(operation: any) {
    // Currently just passes through
    // Future: intelligent parameter resolution
    return operation;
  }
}
```

**Future Implementation**: Full context-aware parameter resolution and agent state management

### Natural Language Processing (Vocabulary Preparation Only)

#### Spatial Vocabulary Data Structures

**Current Implementation**: Define vocabulary structures without processing logic:

```typescript
// lib/spatial/vocabulary.ts (DATA STRUCTURES ONLY)
export const SPATIAL_VOCABULARY = {
  positioning: {
    directional: ["left", "right", "above", "below", "behind", "in front"],
    relative: ["next to", "near", "far from", "between", "around"],
    absolute: ["center", "corner", "edge", "middle", "top", "bottom"]
  },
  arrangements: {
    geometric: ["grid", "circle", "line", "spiral", "cluster"],
    semantic: ["timeline", "gallery", "showcase", "collection"],
    organic: ["scattered", "random", "natural", "flowing"]
  },
  actions: {
    movement: ["move", "shift", "relocate", "position", "place"],
    scaling: ["resize", "scale", "make bigger", "shrink", "expand"],
    rotation: ["rotate", "turn", "orient", "face", "angle"],
    grouping: ["group", "cluster", "separate", "organize", "arrange"]
  }
};

// Placeholder for future natural language processing
export function processSpatialCommand(command: string) {
  throw new Error("Spatial NLP not yet implemented - manual editor first");
}
```

**Future Implementation**: Full natural language processing and spatial command interpretation

---

## User Interface Design

### Space Browser Integration

#### Media Management Parity
Spaces appear alongside other media types in all existing interfaces:

**Management Dashboard**
- Spaces tab in main navigation
- Grid view with 3D preview thumbnails
- Same filtering, sorting, and search capabilities
- Bulk operations (delete, move to project, share)

**Unified Search Results**
- Spaces appear in search results with distinctive 3D icons
- Preview on hover shows 3D thumbnail
- Click to open in space viewer
- Right-click for context menu (edit, duplicate, delete)

**File Manager**
- Spaces listed alongside other assets
- File size shows space complexity (item count)
- Modified date reflects last spatial edit
- Drag and drop to move between projects

#### Space-Specific UI Elements

**Space Card Component**
```
┌─────────────────────────┐
│  [3D Preview Thumbnail] │
│                         │
│  Gallery Space          │
│  24 items • Modified 2h │
│                         │
│  [View] [Edit] [•••]    │
└─────────────────────────┘
```

**Space Creation Flow**
```
Create New Space
├── From Scratch
│   ├── Empty Space
│   ├── Template Gallery
│   └── Template Timeline
└── Import Existing
    ├── From Layout
    ├── From Canvas
    └── From Search Results
```

### 3D Viewer Interface

#### Main Viewer Layout
```
┌─────────────────────────────────────────────────────────┐
│ [< Back] Space Title                    [Edit] [Share]  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│                                                         │
│                3D Space Viewport                        │
│                                                         │
│                                                         │
├─────────────────────────────────────────────────────────┤
│ [Navigation Controls] [View Options] [Agent Chat] [?]   │
└─────────────────────────────────────────────────────────┘
```

#### Navigation Controls
- **Orbit Mode**: Default camera controls for most spaces
- **Walk Mode**: First-person navigation for large environments
- **Fly Mode**: Free-form camera movement for complex arrangements
- **Reset View**: Return to default camera position
- **Fit All**: Zoom to show all content in space

#### View Options
- **Wireframe**: Show spatial structure and relationships
- **Bounding Boxes**: Display item boundaries for precise positioning
- **Grid**: Show 3D grid for alignment reference
- **Zones**: Highlight spatial organization areas
- **Performance**: Toggle LOD and quality settings

### 3D Editor Integration Architecture

#### Three.js Editor Embedding Strategy

We embed the official Three.js Editor to avoid reinventing complex 3D editing functionality:

```typescript
interface EditorBridge {
  // Communication with embedded Three.js Editor
  sendToEditor(command: EditorCommand): void;
  onEditorMessage(handler: (message: EditorMessage) => void): void;

  // Space-specific extensions
  loadSpaceIntoEditor(space: SpaceAsset): void;
  exportSpaceFromEditor(): SpaceAsset;
  syncEditorWithSpace(space: SpaceAsset): void;
}

interface EditorCommand {
  type: 'LOAD_SCENE' | 'SAVE_SCENE' | 'ADD_OBJECT' | 'UPDATE_OBJECT' | 'DELETE_OBJECT';
  payload: any;
}

interface EditorMessage {
  type: 'SCENE_CHANGED' | 'OBJECT_SELECTED' | 'EDITOR_READY';
  data: any;
}

// Editor integration component
const SpaceEditor = ({ spaceId, onSave, onCancel }) => {
  const [editorReady, setEditorReady] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const editorRef = useRef<HTMLIFrameElement>(null);
  const bridgeRef = useRef<EditorBridge>(null);

  useEffect(() => {
    // Initialize editor bridge
    bridgeRef.current = new ThreeJSEditorBridge(editorRef.current);

    // Set up communication
    bridgeRef.current.onEditorMessage((message) => {
      switch (message.type) {
        case 'EDITOR_READY':
          setEditorReady(true);
          loadSpaceIntoEditor();
          break;
        case 'SCENE_CHANGED':
          setHasUnsavedChanges(true);
          break;
        case 'OBJECT_SELECTED':
          // Sync selection with React app
          updateSelectedObject(message.data);
          break;
      }
    });
  }, []);

  const loadSpaceIntoEditor = async () => {
    const space = await getSpaceAsset(spaceId);
    const threeJSScene = convertSpaceToThreeJSScene(space);
    bridgeRef.current.sendToEditor({
      type: 'LOAD_SCENE',
      payload: threeJSScene
    });
  };

  const saveSpace = async () => {
    const threeJSScene = await bridgeRef.current.exportSpaceFromEditor();
    const spaceAsset = convertThreeJSSceneToSpace(threeJSScene, spaceId);
    await saveSpaceAsset(spaceAsset);
    setHasUnsavedChanges(false);
    onSave(spaceAsset);
  };

  return (
    <div className="space-editor">
      <div className="editor-toolbar">
        <button onClick={saveSpace} disabled={!hasUnsavedChanges}>
          Save Space
        </button>
        <button onClick={onCancel}>
          Cancel
        </button>
        <div className="editor-status">
          {editorReady ? 'Editor Ready' : 'Loading Editor...'}
          {hasUnsavedChanges && ' • Unsaved Changes'}
        </div>
      </div>

      <iframe
        ref={editorRef}
        src="/three-js-editor/index.html"
        className="three-js-editor-frame"
        style={{ width: '100%', height: 'calc(100vh - 60px)', border: 'none' }}
      />
    </div>
  );
};
```

#### Space-to-Three.js Scene Conversion

```typescript
function convertSpaceToThreeJSScene(space: SpaceAsset): ThreeJSScene {
  return {
    metadata: {
      version: 4.5,
      type: "Object",
      generator: "HH-Bot Spatial CMS"
    },
    geometries: [],
    materials: generateMaterialsFromSpace(space),
    textures: generateTexturesFromSpace(space),
    images: generateImagesFromSpace(space),
    object: {
      uuid: space.id,
      type: "Scene",
      name: space.title,
      children: space.space.items.map(item => ({
        uuid: item.id,
        type: "Mesh",
        name: item.assetId,
        position: item.position,
        rotation: item.rotation,
        scale: item.scale,
        geometry: generateGeometryForItem(item),
        material: generateMaterialForItem(item),
        userData: {
          spaceItemId: item.id,
          assetId: item.assetId,
          assetType: item.assetType,
          importMetadata: item.importMetadata
        }
      }))
    },
    userData: {
      spaceId: space.id,
      spaceType: space.space_type,
      environment: space.space.environment,
      camera: space.space.camera
    }
  };
}

function convertThreeJSSceneToSpace(scene: ThreeJSScene, spaceId: string): SpaceAsset {
  const existingSpace = getSpaceAsset(spaceId); // Get current space for metadata

  return {
    ...existingSpace,
    space: {
      ...existingSpace.space,
      items: scene.object.children.map(child => ({
        id: child.userData.spaceItemId,
        assetId: child.userData.assetId,
        assetType: child.userData.assetType,
        position: child.position,
        rotation: child.rotation,
        scale: child.scale,
        opacity: child.material?.opacity || 1,
        visible: child.visible !== false,
        importMetadata: child.userData.importMetadata
      })),
      environment: scene.userData.environment,
      camera: scene.userData.camera
    },
    updated_at: new Date().toISOString()
  };
}
```

#### React Three Fiber Native Editor Components

For users who prefer React-native editing, we provide R3F-based controls:

```typescript
const NativeSpaceEditor = ({ space, onUpdate }) => {
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [editMode, setEditMode] = useState<'translate' | 'rotate' | 'scale'>('translate');

  return (
    <div className="native-space-editor">
      <div className="editor-sidebar">
        <Leva
          store={createLevaStore(space)}
          onValuesChange={(values) => onUpdate(values)}
        />

        <div className="edit-mode-controls">
          <button
            className={editMode === 'translate' ? 'active' : ''}
            onClick={() => setEditMode('translate')}
          >
            Move (G)
          </button>
          <button
            className={editMode === 'rotate' ? 'active' : ''}
            onClick={() => setEditMode('rotate')}
          >
            Rotate (R)
          </button>
          <button
            className={editMode === 'scale' ? 'active' : ''}
            onClick={() => setEditMode('scale')}
          >
            Scale (S)
          </button>
        </div>

        <SpaceHierarchy
          space={space}
          selectedItems={selectedItems}
          onSelectionChange={setSelectedItems}
        />
      </div>

      <div className="editor-viewport">
        <Canvas>
          <SpaceScene space={space} />

          {selectedItems.map(itemId => (
            <TransformControls
              key={itemId}
              object={getSpaceItemRef(itemId)}
              mode={editMode}
              onObjectChange={(object) => updateSpaceItem(itemId, object)}
            />
          ))}

          <OrbitControls />
          <Grid />
        </Canvas>
      </div>
    </div>
  );
};

function createLevaStore(space: SpaceAsset) {
  const store = levaStore();

  // Environment controls
  store.addInput('backgroundColor', {
    value: space.space.environment.backgroundColor || '#f0f0f0'
  });

  store.addInput('lighting', {
    value: space.space.environment.lighting || 'studio',
    options: ['studio', 'natural', 'dramatic']
  });

  // Camera controls
  store.addInput('cameraPosition', {
    value: space.space.camera.position,
    step: 0.1
  });

  return store;
}
```

#### Editor Selection Strategy

Users can choose their preferred editing experience:

1. **Three.js Editor (Advanced Users)**
   - Full-featured 3D editor with complete toolset
   - Best for complex spatial arrangements and detailed editing
   - Familiar interface for users with 3D editing experience

2. **Native R3F Editor (Integrated Experience)**
   - Seamlessly integrated with React app
   - Consistent with rest of application UI/UX
   - Better for simple edits and agent-assisted workflows

3. **Hybrid Workflow**
   - Start with agent-generated arrangements
   - Quick edits in native R3F editor
   - Complex modifications in Three.js editor
   - Always maintain space JSON as source of truth

### Editing Interface

#### Edit Mode Activation
- **Edit Button**: Primary action in space viewer
- **Agent Command**: "Let me edit this space"
- **Keyboard Shortcut**: Tab key to toggle edit mode
- **Context Menu**: Right-click on items for quick edit

#### Editing Tools Panel
```
┌─────────────────┐
│ Transform       │
│ ├ Move (G)      │
│ ├ Rotate (R)    │
│ └ Scale (S)     │
│                 │
│ Selection       │
│ ├ Select All    │
│ ├ Select None   │
│ └ Invert        │
│                 │
│ Arrangement     │
│ ├ Grid          │
│ ├ Circle        │
│ ├ Line          │
│ └ Cluster       │
│                 │
│ Environment     │
│ ├ Lighting      │
│ ├ Background    │
│ └ Effects       │
└─────────────────┘
```

#### Properties Panel
Context-sensitive panel showing properties of selected items:
- **Transform**: Position, rotation, scale with numeric inputs
- **Display**: Opacity, visibility, hover effects
- **Content**: Link to original asset, metadata display
- **Relationships**: Constraints and connections to other items

#### Hierarchy View
Tree view of all items in the space:
- **Nested structure**: Groups and individual items
- **Visibility toggles**: Show/hide items or groups
- **Selection sync**: Clicks in hierarchy select in 3D view
- **Drag and drop**: Reorganize hierarchy and groupings

---

## Implementation Strategy

### Development Phases

#### Phase 1: Core Foundation (Weeks 1-2)
**Goal**: Basic space creation, storage, and viewing functionality

**Immediate Implementation**:
- Extend media asset types to include SpaceAsset
- Create basic CRUD API endpoints for spaces
- Implement JSON storage and S3 integration
- Build layout-to-space conversion algorithm with complete decoupling
- Create space browser integration (spaces appear in search, management, etc.)
- Implement simple 3D viewer with orbit controls

**Agentic Hooks (Prepare but Don't Implement)**:
- Add space endpoints to tool registry for auto-discovery
- Create placeholder spatial workflow tools (empty implementations)
- Set up context management hooks for spatial state
- Prepare API schemas for future agent integration

**Success Criteria**:
- Users can manually create spaces from existing layouts
- Basic 3D navigation works smoothly
- Spaces appear in all media management interfaces
- JSON storage and retrieval works reliably
- Performance acceptable with 50+ items

#### Phase 2: Manual Editor Foundation (Weeks 3-4)
**Goal**: Direct 3D manipulation and editing capabilities

**Immediate Implementation**:
- Embed Three.js Editor with iframe integration
- Implement Space-to-Three.js scene conversion
- Build native R3F editor components (TransformControls, Leva)
- Create editing interface with tool selection
- Add basic spatial arrangement algorithms (grid, circle, cluster)

**Agentic Hooks (Prepare but Don't Implement)**:
- Add editor state to spatial context management
- Create hooks for agent-to-editor communication
- Prepare spatial vocabulary data structures
- Set up preview generation infrastructure

**Success Criteria**:
- Users can directly manipulate items in 3D space
- Both Three.js Editor and native R3F editing work
- Scene conversion maintains data integrity
- Basic spatial arrangements can be applied manually

#### Phase 3: Advanced Manual Editing (Weeks 5-6)
**Goal**: Complete manual editing experience

**Immediate Implementation**:
- Implement comprehensive properties and hierarchy panels
- Add advanced spatial arrangement algorithms
- Create keyboard shortcuts and power-user features
- Build undo/redo system for spatial operations
- Optimize performance with LOD and spatial indexing

**Agentic Hooks (Prepare but Don't Implement)**:
- Complete spatial context management system
- Finalize tool registry integration
- Prepare workflow orchestration hooks
- Set up preview and approval infrastructure

**Success Criteria**:
- Professional-grade 3D editing experience
- Complex spatial arrangements possible
- Performance optimized for large collections
- All manual editing workflows complete

#### Phase 4: Agentic Integration (Future - After Manual Editor Complete)
**Goal**: Natural language space creation and manipulation

**Future Implementation** (Not in current scope):
- Implement actual spatial workflow tools with LangGraph
- Add natural language spatial vocabulary processing
- Create agent-driven space generation workflows
- Build preview and approval systems
- Enable conversational spatial manipulation
- Implement context-aware parameter resolution

**Success Criteria** (Future):
- Agent can create spaces from text descriptions
- Users can modify spaces through conversation
- Context awareness works for spatial references
- Seamless hybrid agent/manual workflows

### Technical Implementation Plan

#### Week 1: Data Model & Storage Foundation
**Immediate Implementation**:
1. **Extend MediaAsset types** in `lib/media-storage.ts` to include SpaceAsset, ObjectAsset, ObjectCollection
2. **Create CRUD endpoints** for spaces, objects, and collections with full JSON storage
3. **Update unified search** to include all new content types
4. **Implement S3 JSON storage** with versioning and metadata for all asset types
5. **Add filtering** for new asset types in existing media management interfaces

**Agentic Hooks**:
- Ensure all API endpoints follow tool registry patterns for auto-discovery
- Add placeholder tool definitions for object and space workflows (empty implementations)

#### Week 2: 3D Rendering & Object System
**Immediate Implementation**:
1. **Install R3F dependencies** and configure build system for SSR safety
2. **Create SpaceViewer component** with basic 3D scene rendering
3. **Implement rendering for all asset types**: images, videos, objects, collections
4. **Add orbit controls** and basic navigation
5. **Build object hierarchy rendering** - atomic, composite, and collection support

**Agentic Hooks**:
- Add spatial context hooks to state management
- Prepare object workflow for future agent integration

#### Week 3: Layout Integration & Cross-System Workflows
**Immediate Implementation**:
1. **Build layout conversion algorithm** with complete decoupling for traditional media
2. **Implement object-in-layout support** - 2D icon representation with metadata
3. **Create layout-to-space export** handling both media and objects
4. **Build versioned re-export workflow** with backup and rollback
5. **Add direct insertion workflows** for objects into layouts and spaces

**Agentic Hooks**:
- Prepare cross-system workflows for future agent orchestration
- Set up versioning hooks for agent-driven layout updates

#### Week 4: Three.js Editor Integration
**Immediate Implementation**:
1. **Embed Three.js Editor** with iframe and postMessage bridge
2. **Implement scene conversion** between all asset types and Three.js formats
3. **Create editor communication layer** for loading/saving spaces with objects
4. **Build editing workflow** supporting object hierarchies and collections
5. **Add editor selection UI** (Three.js vs native R3F)

**Agentic Hooks**:
- Prepare editor state for future agent communication
- Set up hooks for agent-driven editing commands

#### Week 5: Native R3F Editor & Object Manipulation
**Immediate Implementation**:
1. **Implement TransformControls** for direct 3D manipulation of all asset types
2. **Create Leva integration** for properties panel with object-specific controls
3. **Build spatial arrangement algorithms** (grid, circle, cluster) for mixed content
4. **Add object hierarchy manipulation** - component, object, collection levels
5. **Implement selection and multi-selection** across different asset types

**Agentic Hooks**:
- Complete spatial context management system
- Prepare arrangement algorithms for agent invocation

#### Week 6: Performance, Polish & Object Browser
**Immediate Implementation**:
1. **Implement LOD system** with distance-based quality reduction for all asset types
2. **Add spatial indexing** using octree for large mixed collections
3. **Optimize 3D model loading** and memory management for object hierarchies
4. **Create object browser** and collection management interfaces
5. **Add comprehensive keyboard shortcuts** and power-user features

**Agentic Hooks**:
- Finalize tool registry integration for all asset types
- Complete all placeholder tool implementations (non-functional)
- Set up preview generation infrastructure
- Prepare workflow orchestration hooks

---

### Future Agentic Integration (Phase 4)

**Not Implemented in Current Scope** - These will be added after manual editor is complete:

#### Agent Workflow Implementation
- Implement actual spatial workflow tools with LangGraph orchestration
- Add natural language spatial vocabulary processing
- Create agent-driven space generation workflows
- Build preview and approval systems

#### Conversational Spatial Control
- Enable conversational spatial manipulation ("move that left", "arrange in circle")
- Implement context-aware parameter resolution
- Add spatial context awareness to agent system
- Create seamless hybrid agent/manual workflows

#### Advanced Agent Features
- Intelligent spatial arrangement based on content analysis
- Agent-suggested improvements and optimizations
- Collaborative agent-human spatial design workflows

### Risk Mitigation

#### Technical Risks

**3D Rendering Performance**
- Risk: Poor performance with large media collections
- Mitigation: Aggressive LOD implementation from day one
- Fallback: Automatic quality reduction and 2D fallback mode

**Browser Compatibility**
- Risk: WebGL support varies across devices and browsers
- Mitigation: Progressive enhancement with capability detection
- Fallback: Graceful degradation to 2D interfaces

**Memory Management**
- Risk: Memory leaks in long-running 3D sessions
- Mitigation: Proactive texture cleanup and garbage collection
- Fallback: Automatic session refresh when memory limits reached

#### User Experience Risks

**3D Interface Complexity**
- Risk: Users find 3D navigation confusing or difficult
- Mitigation: Intuitive defaults, guided tutorials, agent assistance
- Fallback: Always provide 2D alternative views

**Agent Spatial Understanding**
- Risk: Agent generates poor or confusing spatial arrangements
- Mitigation: Constrained vocabulary, preview workflows, manual override
- Fallback: Manual editing takes precedence over agent suggestions

#### Business Risks

**Development Complexity**
- Risk: 3D features significantly slow development velocity
- Mitigation: Phased approach, proven libraries, focused scope
- Fallback: Simplified spatial features that still provide core value

**User Adoption**
- Risk: Users don't understand or use spatial features
- Mitigation: Clear onboarding, compelling use cases, gradual introduction
- Fallback: Spaces remain optional enhancement to existing workflows

---

## Success Metrics

### User Engagement Metrics

**Adoption Rate**
- Target: 40% of active users try spatial features within first month
- Measurement: Unique users who create or view at least one space

**Usage Frequency**
- Target: Users who try spaces return to use them 3+ times per month
- Measurement: Monthly active users of spatial features

**Content Organization**
- Target: Users organize 2x more content using spaces vs traditional methods
- Measurement: Average items per space vs items per traditional collection

### Technical Performance Metrics

**Rendering Performance**
- Target: Maintain 30+ FPS with 200+ items in space
- Measurement: Frame rate monitoring across different device types

**Load Times**
- Target: Initial space load under 3 seconds for typical collections
- Measurement: Time from space selection to interactive 3D view

**Memory Efficiency**
- Target: Memory usage under 1GB for typical use cases
- Measurement: Browser memory consumption during spatial sessions

**Error Rates**
- Target: <5% of spatial operations fail, <1% cause crashes
- Measurement: Error tracking and crash reporting

### User Experience Metrics

**Task Completion**
- Target: 80% of users successfully complete space creation workflow
- Measurement: Funnel analysis from intent to saved space

**Agent Effectiveness**
- Target: 70% of agent-generated spatial arrangements accepted without modification
- Measurement: User approval rate for agent spatial suggestions

**Manual Editing Adoption**
- Target: 60% of space creators use manual editing to refine arrangements
- Measurement: Usage of 3D transform controls and editing interface

### Business Impact Metrics

**Feature Differentiation**
- Target: Spaces become top-3 mentioned feature in user feedback
- Measurement: Feature mention frequency in surveys and support

**Content Creation Efficiency**
- Target: 25% reduction in time to create engaging content presentations
- Measurement: Time tracking for comparable content creation tasks

**User Retention**
- Target: Users who create spaces have 20% higher monthly retention
- Measurement: Cohort analysis comparing spatial vs non-spatial users

---

## Future Expansion Opportunities

### Enhanced Spatial Intelligence

**AI-Powered Spatial Design**
- Automatic spatial arrangement based on content analysis
- Style transfer for spatial layouts (gallery → timeline → cluster)
- Intelligent content suggestions based on spatial context

**Advanced Spatial Relationships**
- Physics-based constraints and interactions
- Temporal relationships for time-based content
- Semantic grouping based on content understanding

### Collaborative Features

**Multi-User Spatial Workspaces**
- Real-time collaborative editing in shared 3D spaces
- User presence indicators and cursor tracking
- Conflict resolution for simultaneous edits

**Social Spatial Experiences**
- Public gallery spaces for content sharing
- Commenting and annotation in 3D context
- Social discovery of interesting spatial arrangements

### Extended Reality Integration

**VR/AR Compatibility**
- WebXR support for immersive spatial editing
- Hand tracking for natural 3D manipulation
- Spatial audio for multimedia content

**Mixed Reality Workflows**
- AR preview of spatial arrangements in physical spaces
- Physical-digital content integration
- Gesture-based spatial control

### Advanced Content Types

**Interactive 3D Objects**
- Support for glTF 3D models and animations
- Interactive hotspots and embedded experiences
- Procedural content generation in spatial context

**Temporal Spatial Experiences**
- Time-based spatial animations and transitions
- Spatial storytelling with narrative progression
- Interactive spatial presentations and tours

---

## Conclusion

Phase 3: Spatial Work represents a significant evolution in how users interact with their media collections, transforming static 2D arrangements into immersive 3D experiences. By building on our proven four-layer architecture and existing agent system, we can deliver revolutionary spatial capabilities without disrupting current workflows.

The phased implementation approach ensures we can validate core concepts quickly while building toward more sophisticated spatial intelligence. The combination of agent-driven creation and manual editing provides both accessibility for casual users and power for advanced creators.

Most importantly, treating Spaces as first-class media assets ensures they integrate seamlessly with our existing infrastructure, making this a natural evolution rather than a disruptive addition to the platform.

The technical foundation leverages mature open-source libraries and proven architectural patterns, reducing implementation risk while enabling sophisticated spatial experiences that differentiate our platform in the competitive content management landscape.
