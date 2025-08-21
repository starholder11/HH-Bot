# PHASE 3: IMPLEMENTATION TASKS
## Sequenced Task List with Spec References

---

## Instructions for Implementation

**CRITICAL**: Each task MUST follow the specifications exactly as defined in `PHASE 3: SPATIAL WORK.md`. Do not deviate from the defined data models, API patterns, or architectural decisions. When in doubt, reference the spec section listed for each task.

**Spec Reference Format**: Each task includes `[Spec: Section Name]` pointing to the exact section in `PHASE 3: SPATIAL WORK.md` that contains the requirements and implementation details.

---

## WEEK 1: Data Model & Storage Foundation

### Task 1.1: Extend Media Asset Types
**Duration**: 1 day
**Spec Reference**: [Data Model & Storage Architecture → Object Asset Structure, Object Collection Structure, SpaceAsset Structure]

**Implementation Requirements**:
1. Add `ObjectAsset`, `ObjectCollection`, and `SpaceAsset` types to `lib/media-storage.ts`
2. Follow exact TypeScript interfaces defined in spec lines 202-269, 275-349, 354-489
3. Ensure all three types extend existing media asset patterns
4. Update `MediaAsset` union type to include all three new types
5. Update `ContentType` enum to include `'object'`, `'object_collection'`, `'space'`

**Validation**:
- TypeScript compilation passes with new types
- All existing media asset functions accept new types
- Zod schemas validate correctly (use schemas from spec lines 1108-1235)

**Files to Modify**:
- `lib/media-storage.ts`
- `app/visual-search/types/index.ts`

---

### Task 1.2: Create CRUD API Endpoints
**Duration**: 2 days
**Spec Reference**: [Tool Registry Integration → Auto-Generated API Tools, Conventions and Policies → Units and Coordinate Conventions]

**Implementation Requirements**:
1. Create `app/api/spaces/route.ts` with GET, POST methods
2. Create `app/api/spaces/[id]/route.ts` with GET, PUT, DELETE methods
3. Create `app/api/objects/route.ts` with GET, POST methods
4. Create `app/api/objects/[id]/route.ts` with GET, PUT, DELETE methods
5. Create `app/api/object-collections/route.ts` with GET, POST methods
6. Create `app/api/object-collections/[id]/route.ts` with GET, PUT, DELETE methods
7. Follow existing API patterns for tool registry auto-discovery
8. Use Zod schemas for request/response validation (spec lines 1108-1235)

**Validation**:
- All endpoints return proper HTTP status codes
- Request/response bodies match Zod schemas exactly
- Error handling follows existing patterns
- Tool registry can auto-discover all endpoints

**Files to Create**:
- `app/api/spaces/route.ts`
- `app/api/spaces/[id]/route.ts`
- `app/api/objects/route.ts`
- `app/api/objects/[id]/route.ts`
- `app/api/object-collections/route.ts`
- `app/api/object-collections/[id]/route.ts`

---

### Task 1.3: Implement S3 JSON Storage
**Duration**: 1 day
**Spec Reference**: [JSON Storage Strategy, Storage Structure]

**Implementation Requirements**:
1. Extend existing S3 storage functions in `lib/media-storage.ts`
2. Implement storage structure from spec lines 187-197:
   ```
   spaces/{spaceId}.json
   spaces/{spaceId}_preview.jpg
   spaces/{spaceId}_metadata.json
   spaces/versions/{spaceId}_v1.json
   ```
3. Similar structure for objects and collections
4. Add versioning support for spaces (backup before overwrites)
5. Implement JSON validation on save/load using Zod schemas

**Validation**:
- Assets save/load correctly to/from S3
- JSON structure matches spec exactly
- Versioning creates backup files
- Validation catches malformed data

**Files to Modify**:
- `lib/media-storage.ts`

---

### Task 1.4: Update Unified Search Integration
**Duration**: 1 day
**Spec Reference**: [Search and Indexing, Media Management Parity]

**Implementation Requirements**:
1. Add new content types to `app/api/unified-search/route.ts`
2. Update search filters to include `'space'`, `'object'`, `'object_collection'`
3. Index object metadata (category, style, tags) per spec
4. Index collection membership and usage graph
5. Ensure search results include proper asset type identification

**Validation**:
- New asset types appear in search results
- Filtering by content type works correctly
- Search relevance includes object metadata
- Results maintain existing format for compatibility

**Files to Modify**:
- `app/api/unified-search/route.ts`
- Search indexing utilities

---

### Task 1.5: Add Asset Type Filtering to Management Interfaces
**Duration**: 1 day
**Spec Reference**: [Space Browser Integration → Media Management Parity]

**Implementation Requirements**:
1. Add tabs for Spaces, Objects, Collections to `app/manage/page.tsx`
2. Update `app/visual-search/page.tsx` to show new asset types in results
3. Add filtering controls for new content types
4. Ensure bulk operations work with new asset types
5. Add proper icons and preview handling for each type

**Validation**:
- New tabs appear in management interface
- Filtering works correctly for each asset type
- Search results display new types with proper styling
- Bulk operations (delete, move to project) work

**Files to Modify**:
- `app/manage/page.tsx`
- `app/visual-search/page.tsx`
- `app/file-manager/page.tsx`

---

### Task 1.6: Import Reference Model Library as System Assets
**Duration**: 1 day
**Spec Reference**: [Reference Model Library, Object Asset Structure]

**Implementation Requirements**:
1. Create import script to convert reference GLB models to ObjectAssets
2. Import models from `public/models/reference/threejs/` into system:
   - DamagedHelmet.glb → ObjectAsset with category "props", subcategory "helmet"
   - BoomBox.glb → ObjectAsset with category "electronics", subcategory "audio"
   - Lantern.glb → ObjectAsset with category "lighting", subcategory "portable"
   - Duck.glb → ObjectAsset with category "toys", subcategory "animals"
   - Sponza.glb → ObjectAsset with category "architectural", subcategory "scene"
3. Generate proper metadata, thumbnails, and bounding boxes
4. Create basic ObjectCollection with 2-3 reference objects
5. Store in S3 following exact storage structure from spec lines 187-197

**Validation**:
- Reference objects appear in object browser
- Objects can be searched and filtered by category
- GLB models load correctly in 3D viewer
- Collection renders instances properly
- All objects follow ObjectAsset schema exactly

**Files to Create**:
- `scripts/import-reference-models.ts`
- Reference object JSON files in S3

---

### Task 1.7: Create Placeholder Tool Definitions
**Duration**: 0.5 days
**Spec Reference**: [Custom Spatial Workflow Tools → Placeholder Only]

**Implementation Requirements**:
1. Create `lib/tools/spatial-workflows.ts` with placeholder tools from spec lines 1242-1270
2. Create `lib/tools/spatial-ui-actions.ts` with infrastructure from spec lines 1279-1292
3. All tools must throw "not implemented" errors with clear messages
4. Follow exact parameter schemas defined in spec
5. Register tools with existing tool registry system

**Validation**:
- Tool registry discovers all placeholder tools
- Tools throw appropriate "not implemented" errors
- Parameter schemas validate correctly
- No actual functionality implemented yet

**Files to Create**:
- `lib/tools/spatial-workflows.ts`
- `lib/tools/spatial-ui-actions.ts`

---

## WEEK 2: 3D Rendering & Object System

### Task 2.1: Install and Configure R3F Dependencies
**Duration**: 0.5 days
**Spec Reference**: [Technology Stack → Core 3D Rendering, 3D Editor Integration]

**Implementation Requirements**:
1. Install exact dependencies from spec:
   ```bash
   npm i @react-three/fiber @react-three/drei three
   npm i @react-three/postprocessing leva
   npm i @types/three
   ```
2. Configure Next.js for SSR safety with dynamic imports
3. Add TypeScript definitions for Three.js
4. Test basic R3F rendering works

**Validation**:
- All dependencies install without conflicts
- Basic R3F Canvas renders without errors
- SSR builds complete successfully
- No TypeScript errors

**Files to Modify**:
- `package.json`
- `next.config.js` (if needed for SSR)

---

### Task 2.2: Create SpaceViewer Component Foundation
**Duration**: 2 days
**Spec Reference**: [Component Architecture → High-Level Structure, SpaceControls Component]

**Implementation Requirements**:
1. Create `app/spaces/[id]/page.tsx` following spec structure lines 1093-1111
2. Implement `SpaceViewer` component with Canvas wrapper
3. Add `SpaceControls` component following spec lines 1164-1191
4. Implement camera control switching (orbit/first-person/fly)
5. Add basic environment setup (lighting, background)

**Validation**:
- Space viewer page loads without errors
- Camera controls work smoothly
- Different control modes switch correctly
- Basic 3D scene renders

**Files to Create**:
- `app/spaces/[id]/page.tsx`
- `components/spatial/SpaceViewer.tsx`
- `components/spatial/SpaceControls.tsx`

---

### Task 2.3: Implement Mixed Asset Type Rendering
**Duration**: 2 days
**Spec Reference**: [SpaceItem Component, Reference Model Library]

**Implementation Requirements**:
1. Create `SpaceItem` component following spec lines 1115-1161
2. Implement rendering for all asset types:
   - Images/videos: textured planes
   - Objects: glTF models using `useGLTF`
   - Collections: instanced rendering where possible
3. Use reference models from `public/models/reference/threejs/`
4. Implement LOD system with distance thresholds from spec lines 1124-1129
5. Add hover effects and selection outlines

**Validation**:
- All asset types render correctly in 3D space
- LOD system reduces quality at distance
- Reference GLB models load and display
- Selection and hover effects work

**Files to Create**:
- `components/spatial/SpaceItem.tsx`
- `components/spatial/SpaceScene.tsx`
- `hooks/useSpaceAsset.ts`

---

### Task 2.4: Build Object Hierarchy Rendering
**Duration**: 2 days
**Spec Reference**: [Object Asset Structure → Composite Objects, Object Collection Structure]

**Implementation Requirements**:
1. Implement composite object rendering (objects with components)
2. Build collection rendering with transform hierarchies
3. Add support for `quantity` field using `THREE.InstancedMesh`
4. Implement `showComponents` and `interactionLevel` properties
5. Handle nested collections (subCollections)

**Validation**:
- Composite objects render all components correctly
- Collections show proper instance positioning
- Interaction levels work (select collection vs individual objects)
- Performance acceptable with instanced rendering

**Files to Create**:
- `components/spatial/ObjectRenderer.tsx`
- `components/spatial/CollectionRenderer.tsx`
- `utils/spatial/instancing.ts`

---

### Task 2.5: Add Basic Navigation and Performance
**Duration**: 1 day
**Spec Reference**: [Performance Architecture → LOD System, Memory Management]

**Implementation Requirements**:
1. Implement distance-based LOD from spec lines 1196-1200
2. Add frustum culling and viewport optimization
3. Implement texture disposal for distant items
4. Add basic performance monitoring
5. Set up memory cleanup on component unmount

**Validation**:
- Frame rate stays above 30 FPS with 50+ items
- Memory usage doesn't grow unbounded
- Distant items use lower quality textures
- Performance monitoring shows accurate metrics

**Files to Create**:
- `hooks/usePerformanceMonitor.ts`
- `utils/spatial/lod.ts`
- `utils/spatial/memory-management.ts`

---

## WEEK 3: Layout Integration & Cross-System Workflows

### Task 3.1: Build Layout-to-Space Conversion Algorithm
**Duration**: 2 days
**Spec Reference**: [2D → 3D Mapping: Formulas and Test Vectors, Layout-to-Space Import Mapping]

**Implementation Requirements**:
1. Implement `importLayoutToSpace` function following spec lines 578-639
2. Use exact coordinate transformation formulas from spec lines 1005-1021
3. Implement test vectors from spec lines 1025-1061 as unit tests
4. Apply grouping strategies (flat/clustered/elevated) from spec lines 641-702
5. Ensure complete decoupling per spec lines 552-557

**Validation**:
- All test vectors pass with expected coordinates (±0.001m precision)
- Layout import creates independent space asset
- Grouping algorithms work correctly
- Original layout remains unchanged

**Files to Create**:
- `lib/spatial/layout-import.ts`
- `lib/spatial/coordinate-transform.ts`
- `lib/spatial/grouping-algorithms.ts`
- `__tests__/spatial/coordinate-transform.test.ts`

---

### Task 3.2: Implement Object-in-Layout Support
**Duration**: 1 day
**Spec Reference**: [Objects and Collections in Layouts]

**Implementation Requirements**:
1. Extend `LayoutAsset` type to support objects per spec lines 483-503
2. Add `objectLayoutProperties` with iconUrl, boundingBox2D, showLabel
3. Implement 2D icon generation for objects and collections
4. Update layout editor to handle object placement
5. Add object-specific layout properties panel

**Validation**:
- Objects appear as 2D icons in layouts
- Icon generation works for all object types
- Layout editor can position and resize object icons
- Properties save correctly to layout JSON

**Files to Modify**:
- Layout editor components
- `lib/media-storage.ts` (LayoutAsset type)

**Files to Create**:
- `utils/spatial/icon-generation.ts`

---

### Task 3.3: Create Layout-to-Space Export Workflow
**Duration**: 2 days
**Spec Reference**: [Independent Coordinate Systems & Versioned Workflows, Cross-System Integration Workflows]

**Implementation Requirements**:
1. Implement `exportLayoutToSpace` function handling mixed content types
2. Build versioned re-export workflow from spec lines 527-547
3. Implement `sourceMappings` tracking per spec lines 490-498
4. Add backup/restore functionality for space versions
5. Preserve manually added items during re-export

**Validation**:
- Layout export creates proper space asset
- Re-export creates version backup
- Only layout-sourced items get updated
- Manual space edits preserved during re-export

**Files to Create**:
- `lib/spatial/export-workflows.ts`
- `lib/spatial/version-management.ts`
- `app/api/spaces/export-layout/route.ts`

---

### Task 3.4: Build Direct Insertion Workflows
**Duration**: 1 day
**Spec Reference**: [Cross-System Integration Workflows → Direct Insertion]

**Implementation Requirements**:
1. Implement `addObjectToLayout` function with 2D representation
2. Implement `addObjectToSpace` function with 3D positioning
3. Add drag-and-drop from object browser to layouts/spaces
4. Calculate appropriate default positioning and scaling
5. Update asset browsers to support dragging objects

**Validation**:
- Objects can be dragged into layouts as 2D icons
- Objects can be dragged into spaces as 3D models
- Default positioning is sensible
- Asset references maintain integrity

**Files to Create**:
- `lib/spatial/direct-insertion.ts`
- `hooks/useDragAndDrop.ts`

---

### Task 3.5: Add Import/Export UI Controls
**Duration**: 1 day
**Spec Reference**: [Primary User Flows → Import Layout to Space]

**Implementation Requirements**:
1. Add "Import to Space" button to layout viewer
2. Create import dialog with grouping options (flat/clustered/elevated)
3. Add "Export to Layout" button to space viewer (future use)
4. Add re-export confirmation dialog with version warning
5. Show import/export progress and success feedback

**Validation**:
- Import button appears on layout pages
- Import dialog shows correct options
- Progress feedback works during import
- Success/error states handled properly

**Files to Modify**:
- Layout viewer pages
- Space viewer pages

**Files to Create**:
- `components/spatial/ImportDialog.tsx`
- `components/spatial/ExportDialog.tsx`

---

## WEEK 4: Three.js Editor Integration

### Task 4.1: Embed Three.js Editor with iframe
**Duration**: 2 days
**Spec Reference**: [3D Editor Integration Architecture → Three.js Editor Embedding Strategy]

**Implementation Requirements**:
1. Download and host Three.js Editor in `public/three-js-editor/`
2. Create `SpaceEditor` component following spec lines 1174-1242
3. Implement `EditorBridge` interface from spec lines 1152-1161
4. Set up postMessage communication with security validation
5. Add editor ready state and error handling

**Validation**:
- Three.js Editor loads in iframe without errors
- postMessage communication works bidirectionally
- Security validation prevents malicious payloads
- Editor ready state detected correctly

**Files to Create**:
- `public/three-js-editor/` (downloaded editor)
- `components/spatial/SpaceEditor.tsx`
- `lib/spatial/editor-bridge.ts`
- `app/spaces/[id]/edit/page.tsx`

---

### Task 4.2: Implement Scene Conversion Functions
**Duration**: 2 days
**Spec Reference**: [Space-to-Three.js Scene Conversion]

**Implementation Requirements**:
1. Implement `convertSpaceToThreeJSScene` function from spec lines 1248-1286
2. Implement `convertThreeJSSceneToSpace` function from spec lines 1289-1312
3. Handle all asset types (media, objects, collections) in conversion
4. Preserve userData and metadata during conversion
5. Maintain transform precision and coordinate conventions

**Validation**:
- Space assets convert to valid Three.js scenes
- Three.js scenes convert back to space assets
- All asset types handled correctly
- No data loss during round-trip conversion

**Files to Create**:
- `lib/spatial/scene-conversion.ts`
- `__tests__/spatial/scene-conversion.test.ts`

---

### Task 4.3: Create Editor Communication Layer
**Duration**: 1 day
**Spec Reference**: [EditorCommand, EditorMessage interfaces]

**Implementation Requirements**:
1. Implement command/message interfaces from spec lines 1163-1171
2. Add scene loading/saving commands
3. Implement object selection synchronization
4. Add unsaved changes tracking
5. Handle editor errors and timeouts

**Validation**:
- Commands sent to editor execute correctly
- Messages from editor handled properly
- Selection sync works between React app and editor
- Error states communicated clearly

**Files to Modify**:
- `lib/spatial/editor-bridge.ts`

---

### Task 4.4: Build Editing Workflow for Object Hierarchies
**Duration**: 1.5 days
**Spec Reference**: [Object Asset Structure → Composite Objects, Object Collection Structure]

**Implementation Requirements**:
1. Handle composite objects in editor (show/hide components)
2. Support collection editing with instance management
3. Implement hierarchy manipulation in editor
4. Add object-specific editing tools and properties
5. Handle transform constraints and relationships

**Validation**:
- Composite objects edit correctly in Three.js Editor
- Collections maintain instance relationships
- Hierarchy changes save properly
- Object properties persist through edit sessions

**Files to Modify**:
- `lib/spatial/scene-conversion.ts`
- `lib/spatial/editor-bridge.ts`

---

### Task 4.5: Add Editor Selection UI
**Duration**: 0.5 days
**Spec Reference**: [Editor Selection Strategy]

**Implementation Requirements**:
1. Add toggle between Three.js Editor and native R3F editor
2. Implement editor preference saving
3. Add "Switch Editor" button with confirmation
4. Handle unsaved changes when switching editors
5. Maintain editing state across editor switches

**Validation**:
- Editor selection UI works correctly
- Preferences save and restore
- Unsaved changes handled safely
- State maintained across switches

**Files to Create**:
- `components/spatial/EditorSelector.tsx`

---

## WEEK 5: Native R3F Editor & Object Manipulation

### Task 5.1: Implement TransformControls for All Asset Types
**Duration**: 2 days
**Spec Reference**: [React Three Fiber Native Editor Components]

**Implementation Requirements**:
1. Create `NativeSpaceEditor` component from spec lines 1320-1378
2. Implement TransformControls for move/rotate/scale operations
3. Add keyboard shortcuts (G, R, S) for transform modes
4. Handle multi-selection across different asset types
5. Support object hierarchy manipulation (component/object/collection levels)

**Validation**:
- Transform controls work for all asset types
- Keyboard shortcuts function correctly
- Multi-selection handles mixed content types
- Hierarchy levels selectable independently

**Files to Create**:
- `components/spatial/NativeSpaceEditor.tsx`
- `components/spatial/TransformControlsWrapper.tsx`
- `hooks/useTransformControls.ts`

---

### Task 5.2: Create Leva Integration for Properties Panel
**Duration**: 1 day
**Spec Reference**: [createLevaStore function]

**Implementation Requirements**:
1. Implement `createLevaStore` function from spec lines 1381-1400
2. Add environment controls (backgroundColor, lighting, fog)
3. Add camera controls with real-time updates
4. Add object-specific properties panel
5. Implement property change handlers

**Validation**:
- Leva panel shows correct properties
- Property changes update 3D scene immediately
- Object-specific properties appear when selected
- Changes persist to space asset

**Files to Create**:
- `components/spatial/PropertiesPanel.tsx`
- `utils/spatial/leva-store.ts`

---

### Task 5.3: Build Spatial Arrangement Algorithms
**Duration**: 2 days
**Spec Reference**: [Spatial Vocabulary → Arrangement Patterns, applyGroupingStrategy functions]

**Implementation Requirements**:
1. Implement grid arrangement algorithm for mixed content
2. Implement circle arrangement algorithm
3. Implement cluster arrangement algorithm from spec lines 657-702
4. Add timeline arrangement for temporal content
5. Support arrangement of mixed asset types (media + objects)

**Validation**:
- All arrangement algorithms work with mixed content
- Arrangements preserve object relationships
- Algorithms handle edge cases (single item, empty space)
- Performance acceptable with large item counts

**Files to Create**:
- `lib/spatial/arrangement-algorithms.ts`
- `__tests__/spatial/arrangements.test.ts`

---

### Task 5.4: Add Object Hierarchy Manipulation
**Duration**: 1.5 days
**Spec Reference**: [Object-specific properties → interactionLevel]

**Implementation Requirements**:
1. Implement interaction level switching (collection/object/component)
2. Add component-level selection and manipulation
3. Support breaking apart collections into individual objects
4. Add grouping objects into new collections
5. Handle transform inheritance in hierarchies

**Validation**:
- Can select and edit at different hierarchy levels
- Breaking apart collections works correctly
- Grouping creates valid collections
- Transform inheritance behaves predictably

**Files to Create**:
- `utils/spatial/hierarchy-manipulation.ts`
- `components/spatial/HierarchyControls.tsx`

---

### Task 5.5: Implement Selection and Multi-Selection
**Duration**: 1 day
**Spec Reference**: [Editing Tools Panel → Selection]

**Implementation Requirements**:
1. Add click selection for individual items
2. Implement box selection for multiple items
3. Add Ctrl+click for additive selection
4. Support selection across different asset types
5. Add "Select All", "Select None", "Invert Selection" commands

**Validation**:
- Single selection works for all asset types
- Multi-selection handles mixed content
- Selection state syncs with properties panel
- Selection commands work correctly

**Files to Create**:
- `hooks/useSelection.ts`
- `components/spatial/SelectionBox.tsx`

---

## WEEK 6: Performance, Polish & Object Browser

### Task 6.1: Implement LOD System for All Asset Types
**Duration**: 2 days
**Spec Reference**: [Performance Architecture → Level of Detail System]

**Implementation Requirements**:
1. Implement distance-based quality reduction from spec lines 1196-1200
2. Add frustum culling for viewport optimization
3. Implement occlusion culling for complex scenes
4. Add batch rendering for similar items
5. Support LOD for object hierarchies and collections

**Validation**:
- LOD system maintains 30+ FPS with 200+ items
- Quality reduction visible at appropriate distances
- Culling improves performance measurably
- Object hierarchies respect LOD settings

**Files to Create**:
- `utils/spatial/lod-system.ts`
- `hooks/useLOD.ts`

---

### Task 6.2: Add Spatial Indexing with Octree
**Duration**: 1.5 days
**Spec Reference**: [Spatial Indexing → Octree structure]

**Implementation Requirements**:
1. Implement octree spatial indexing from spec lines 1208-1212
2. Add viewport culling using spatial index
3. Implement proximity queries for grouping
4. Add collision detection for placement
5. Optimize for large mixed collections

**Validation**:
- Spatial queries execute efficiently
- Viewport culling improves performance
- Proximity detection works accurately
- Performance scales with item count

**Files to Create**:
- `utils/spatial/octree.ts`
- `utils/spatial/spatial-queries.ts`

---

### Task 6.3: Optimize 3D Model Loading and Memory Management
**Duration**: 1 day
**Spec Reference**: [Memory Management, glTF Ingestion Policy]

**Implementation Requirements**:
1. Implement progressive loading for large models
2. Add texture compression and optimization
3. Implement automatic garbage collection
4. Add memory pressure monitoring
5. Follow glTF ingestion policies from spec lines 1088-1092

**Validation**:
- Large models load progressively
- Memory usage stays under 1GB limit
- Garbage collection prevents memory leaks
- Texture optimization reduces bandwidth

**Files to Create**:
- `utils/spatial/model-loading.ts`
- `utils/spatial/memory-monitor.ts`

---

### Task 6.4: Create Object Browser and Collection Management
**Duration**: 2 days
**Spec Reference**: [Space Browser Integration → Media Management Parity]

**Implementation Requirements**:
1. Create object browser page `app/objects/page.tsx`
2. Add collection management interface `app/collections/page.tsx`
3. Implement tree view for object hierarchies
4. Add object creation and editing workflows
5. Support collection assembly from existing objects

**Validation**:
- Object browser shows all objects with proper categorization
- Collection management allows creating/editing collections
- Tree view handles complex hierarchies
- Drag-and-drop assembly works

**Files to Create**:
- `app/objects/page.tsx`
- `app/collections/page.tsx`
- `components/objects/ObjectBrowser.tsx`
- `components/objects/CollectionEditor.tsx`

---

### Task 6.5: Add Comprehensive Keyboard Shortcuts
**Duration**: 0.5 days
**Spec Reference**: [Responsive Design Considerations → Desktop Experience]

**Implementation Requirements**:
1. Implement standard 3D software shortcuts (G, R, S, Tab)
2. Add selection shortcuts (A, Alt+A, Ctrl+I)
3. Add view shortcuts (Home, F for frame, Numpad for views)
4. Add undo/redo shortcuts (Ctrl+Z, Ctrl+Y)
5. Display shortcut help overlay

**Validation**:
- All shortcuts work correctly in 3D editor
- Shortcuts don't conflict with browser defaults
- Help overlay shows current shortcuts
- Shortcuts work across different editor modes

**Files to Create**:
- `hooks/useKeyboardShortcuts.ts`
- `components/spatial/ShortcutHelp.tsx`

---

## AGENTIC HOOKS COMPLETION (Throughout All Weeks)

### Task A.1: Finalize Tool Registry Integration
**Duration**: Ongoing
**Spec Reference**: [Tool Registry Integration → Auto-Generated API Tools]

**Implementation Requirements**:
1. Ensure all API endpoints follow tool registry patterns
2. Validate tool auto-discovery works for all new endpoints
3. Complete placeholder tool implementations (non-functional)
4. Add proper error messages for unimplemented tools
5. Test tool registry can discover and list all spatial tools

**Validation**:
- Tool registry discovers all spatial endpoints
- Placeholder tools return appropriate errors
- Tool metadata includes correct parameter schemas
- No functional tool implementation yet

---

### Task A.2: Complete Spatial Context Management System
**Duration**: Ongoing
**Spec Reference**: [Context Management → Spatial Context Infrastructure]

**Implementation Requirements**:
1. Implement `SpatialContextManager` from spec lines 1302-1320
2. Add hooks for spatial state tracking
3. Prepare context enrichment infrastructure
4. Add spatial context to Redis state management
5. Set up context invalidation and cleanup

**Validation**:
- Spatial context tracks current state correctly
- Context hooks integrate with existing state management
- Redis storage works for spatial context
- Context cleanup prevents memory leaks

**Files to Create**:
- `lib/context/spatial-context.ts`
- `hooks/useSpatialContext.ts`

---

### Task A.3: Set Up Preview Generation Infrastructure
**Duration**: Ongoing
**Spec Reference**: [Preview and Icon Generation]

**Implementation Requirements**:
1. Set up thumbnail generation for spaces
2. Implement object icon generation pipeline
3. Add turntable animation generation for collections
4. Set up S3 storage for generated previews
5. Add CDN integration for preview distribution

**Validation**:
- Thumbnails generate correctly for all asset types
- Icons cache properly in S3 and CDN
- Preview generation doesn't block main workflows
- Fallback icons work for failed generation

**Files to Create**:
- `lib/spatial/preview-generation.ts`
- `utils/spatial/thumbnail-generator.ts`

---

### Task A.4: Prepare Workflow Orchestration Hooks
**Duration**: Ongoing
**Spec Reference**: [Future Agentic Integration → Agent Workflow Implementation]

**Implementation Requirements**:
1. Set up workflow state management hooks
2. Add progress tracking infrastructure
3. Prepare streaming update mechanisms
4. Add workflow cancellation support
5. Set up correlation ID tracking for debugging

**Validation**:
- Workflow state management ready for LangGraph
- Progress tracking infrastructure functional
- Streaming updates work with existing SSE system
- Correlation IDs flow through all operations

**Files to Create**:
- `lib/workflows/spatial-workflow-hooks.ts`
- `hooks/useWorkflowState.ts`

---

## TESTING AND VALIDATION

### Task T.1: Unit Tests for Core Functions
**Duration**: 1 day
**Spec Reference**: [2D → 3D Mapping: Test Vectors]

**Implementation Requirements**:
1. Test coordinate transformation with all test vectors from spec
2. Test grouping algorithms with various input sizes
3. Test scene conversion round-trip integrity
4. Test object hierarchy rendering and manipulation
5. Test versioning and backup/restore functionality

**Files to Create**:
- `__tests__/spatial/coordinate-transform.test.ts`
- `__tests__/spatial/grouping-algorithms.test.ts`
- `__tests__/spatial/scene-conversion.test.ts`
- `__tests__/spatial/object-hierarchy.test.ts`
- `__tests__/spatial/versioning.test.ts`

---

### Task T.2: Integration Tests for Cross-System Workflows
**Duration**: 1 day
**Spec Reference**: [Cross-System Integration Workflows]

**Implementation Requirements**:
1. Test layout → space export with mixed content
2. Test versioned re-export preserves manual edits
3. Test direct insertion into layouts and spaces
4. Test object browser drag-and-drop workflows
5. Test editor switching with unsaved changes

**Files to Create**:
- `__tests__/integration/cross-system-workflows.test.ts`
- `__tests__/integration/editor-integration.test.ts`

---

### Task T.3: Performance Testing with Reference Models
**Duration**: 0.5 days
**Spec Reference**: [Performance Architecture, Reference Model Library]

**Implementation Requirements**:
1. Test performance with reference models from `public/models/reference/`
2. Validate 30+ FPS target with 200+ items
3. Test memory usage stays under 1GB limit
4. Test LOD system effectiveness
5. Test spatial indexing performance

**Files to Create**:
- `__tests__/performance/spatial-performance.test.ts`

---

## DEPLOYMENT PREPARATION

### Task D.1: Documentation and Help System
**Duration**: 1 day
**Spec Reference**: [Complete spec document]

**Implementation Requirements**:
1. Create user documentation for spatial features
2. Add in-app help for 3D editor
3. Document keyboard shortcuts and workflows
4. Add troubleshooting guide for common issues
5. Create developer documentation for extending spatial system

**Files to Create**:
- `docs/spatial-user-guide.md`
- `components/spatial/HelpOverlay.tsx`
- `docs/spatial-developer-guide.md`

---

### Task D.2: Analytics Integration
**Duration**: 0.5 days
**Spec Reference**: [Success Metrics]

**Implementation Requirements**:
1. Add analytics tracking for spatial feature usage
2. Track performance metrics (FPS, memory, load times)
3. Add user engagement tracking (space creation, editing time)
4. Implement error tracking and crash reporting
5. Set up dashboards for monitoring spatial system health

**Files to Create**:
- `lib/analytics/spatial-tracking.ts`
- Performance monitoring integration

---

## FINAL VALIDATION

### Task F.1: End-to-End Workflow Testing
**Duration**: 1 day
**Spec Reference**: [Primary User Flows]

**Implementation Requirements**:
1. Test complete layout → space import workflow
2. Test space creation from scratch with objects
3. Test manual editing with both editor types
4. Test cross-system workflows with mixed content
5. Validate all success criteria from each phase

**Validation Criteria**:
- All user flows complete successfully
- Performance targets met
- No data corruption or loss
- Error handling works gracefully
- System ready for production use

---

## CRITICAL SUCCESS CRITERIA

Each task must meet these criteria before moving to the next:

1. **Spec Compliance**: Implementation matches spec exactly
2. **Type Safety**: Full TypeScript coverage with no `any` types
3. **Performance**: Meets or exceeds performance targets
4. **Error Handling**: Graceful degradation and clear error messages
5. **Testing**: Unit tests pass and integration tests validate workflows
6. **Documentation**: Code documented and user-facing features explained

**REMINDER**: Do not deviate from the spec. When implementation details are unclear, reference the specific spec section and ask for clarification rather than improvising.
