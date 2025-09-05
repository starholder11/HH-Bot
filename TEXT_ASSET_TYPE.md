# TEXT_ASSET_TYPE
### S3-Based Text Asset Specification

---

## Executive Summary

This spec defines the S3-based text asset type for the HH-Bot system, replacing git-based text storage with a UUID-based JSON asset model. Text assets are stored as JSON documents in S3, following the same patterns as existing media assets while providing rich metadata and content management capabilities.

---

## Core Data Structure

### S3TextAsset Interface

```typescript
interface S3TextAsset {
  // Core identification (UUID-based)
  id: string;                    // UUID: "550e8400-e29b-41d4-a716-446655440000"
  media_type: "text";

  // Content fields
  title: string;                 // Display title
  content: string;               // MDX content (was separate .mdx file in git)
  date: string;                  // ISO date string

  // Metadata with unique slug constraint
  metadata: {
    slug: string;                // REQUIRED & UNIQUE: "withered-grove"

    // Core workflow fields
    source: string;              // "conversation" | "layout" | "keystatic" | "import" | "migration"
    status: string;              // "draft" | "published"
    categories: string[];        // ["lore", "location", "mystery"]

    // Keystatic compatibility
    gallery?: string[];          // Asset UUIDs referencing media
    attachments?: string[];      // Asset UUIDs referencing media

    // Scribe/conversation extensions
    scribe_enabled?: boolean;    // Auto-updating document mode
    conversation_id?: string;    // Source conversation
    layout_id?: string;          // UUID of creating layout

    // Rich tagging arrays
    tags?: string[];             // ["dark", "atmospheric", "discovery"]
    themes?: string[];           // ["decay", "mystery", "transformation"]
    characters?: string[];       // ["elena", "the-wanderer"]
    locations?: string[];        // ["northern-wastes", "grove-of-echoes"]
    events?: string[];           // ["the-great-convergence"]

    // Migration tracking
    migrated_from_git?: boolean; // Migration status flag
    original_git_path?: string;  // "content/timeline/withered-grove/"
  };

  // Standard timestamps
  created_at: string;            // ISO date
  updated_at: string;            // ISO date
}
```

---

## Example JSON Document

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "media_type": "text",
  "title": "The Withered Grove",
  "content": "# The Withered Grove\n\nIn the shadow of the dying trees, where the last whispers of ancient magic still cling to the bark like morning frost, Elena discovered something that would change everything.\n\n## The Discovery\n\nThe grove had been withering for decades...",
  "date": "2024-12-19T10:30:00.000Z",
  "metadata": {
    "slug": "withered-grove",
    "source": "layout",
    "status": "draft",
    "categories": ["lore", "location", "mystery"],
    "gallery": ["a1b2c3d4-e5f6-7890-abcd-ef1234567890"],
    "attachments": ["i9j0k1l2-m3n4-5678-opqr-st9012345678"],
    "tags": ["dark", "atmospheric", "discovery"],
    "themes": ["decay", "mystery", "transformation"],
    "characters": ["elena", "the-wanderer"],
    "locations": ["northern-wastes", "grove-of-echoes"],
    "migrated_from_git": false
  },
  "created_at": "2024-12-19T10:30:00.000Z",
  "updated_at": "2024-12-19T15:45:00.000Z"
}
```

---

## Slug Uniqueness Constraint

### Requirements
- **UNIQUE**: No two text assets can share the same slug
- **FORMAT**: Must match `/^[a-z0-9-]+$/` (lowercase, numbers, dashes only)
- **COLLISION HANDLING**: Auto-append `-2`, `-3`, etc. for conflicts
- **VALIDATION**: Check uniqueness across both S3 and git systems during transition

### Implementation Functions

```typescript
// Generate unique slug with collision handling
async function generateUniqueSlug(title: string, excludeId?: string): Promise<string>

// Check if slug exists in either S3 or git systems
async function slugExists(slug: string, excludeId?: string): Promise<boolean>

// Validate complete text asset before save
async function validateTextAsset(asset: Partial<S3TextAsset>): Promise<string[]>
```

---

## Storage Location

### S3 Path Pattern
- **Bucket**: Same as existing media assets (`S3_BUCKET_NAME`)
- **Key**: `media-labeling/assets/{uuid}.json`
- **Example**: `media-labeling/assets/550e8400-e29b-41d4-a716-446655440000.json`

### No File URLs Required
Unlike image/video assets, text assets don't require `s3_url` or `cloudflare_url` fields since content is embedded in JSON, not served as separate files.

---

## Reference Formats

### Primary References (UUID-based)
- **Layout content_ref**: `contentId: "550e8400-e29b-41d4-a716-446655440000"`
- **API endpoints**: `/api/media-assets/{uuid}`
- **Search results**: Return UUID as primary identifier

### Human-Readable URLs (slug-based)
- **Public URLs**: `/text/{slug}` → resolve slug to UUID
- **Admin URLs**: `/admin/text/{slug}/edit`

### Legacy Migration Support
- **Git format**: `text_timeline/{slug}` → lookup by slug → return UUID
- **Transition**: Dual-read support during migration period

---

## Content Source Types

### Source Field Values
- **`conversation`**: Created via chat/scribe features
- **`layout`**: Created via layout editor DOC button
- **`keystatic`**: Created via Keystatic CMS (remains git-based)
- **`import`**: Bulk import from external sources
- **`migration`**: Migrated from existing git timeline

### Status Field Values
- **`draft`**: Work in progress, not published
- **`published`**: Ready for public consumption

---

## Integration Points

### Creation Flows
1. **Layout Editor DOC button** → S3 text asset
2. **LoreScribeModal** → S3 text asset
3. **Agent-generated content** → S3 text asset
4. **Chat background docs** → S3 text asset
5. **Keystatic timeline** → Git-based (unchanged)

### Reading Flows
1. **Layout rendering** → Dual-read (S3 first, git fallback)
2. **Canvas text objects** → Dual-read
3. **Asset search** → Include both S3 and git results
4. **Public text pages** → Slug resolution to UUID

### Migration Strategy
1. **Phase 1**: Add S3 support alongside git
2. **Phase 2**: New content writes to S3 only
3. **Phase 3**: Migrate existing git content to S3
4. **Phase 4**: Remove git dependencies

---

## API Endpoints

### CRUD Operations
- **Create**: `POST /api/media-assets` (with `media_type: "text"`)
- **Read**: `GET /api/media-assets/{uuid}`
- **Update**: `PUT /api/media-assets/{uuid}`
- **Delete**: `DELETE /api/media-assets/{uuid}`

### Slug Resolution
- **By slug**: `GET /api/text-assets/by-slug/{slug}` → returns UUID
- **Slug check**: `GET /api/text-assets/slug-exists/{slug}` → boolean

### Migration Support
- **Dual read**: Existing `/api/text-assets/{slug}` checks S3 first, git fallback
- **Migration**: `POST /api/text-assets/migrate/{slug}` → git to S3

---

## Validation Rules

### Required Fields
- `id` (UUID)
- `media_type` ("text")
- `title` (non-empty string)
- `content` (string, can be empty)
- `date` (valid ISO date)
- `metadata.slug` (unique, valid format)
- `metadata.source` (valid enum value)
- `metadata.status` (valid enum value)
- `metadata.categories` (array)

### Format Constraints
- **Slug**: `/^[a-zA-Z0-9-]+$/`
- **UUID**: Standard UUID v4 format
- **Dates**: ISO 8601 format
- **Arrays**: Must be arrays (can be empty)

---

## Scribe and Layout Editor DOC Migration

### S3-Only Support (Breaking Change)
Starting immediately, both the **Scribe feature** and **Layout Editor DOC button** will create S3-based text assets exclusively. Git-based text asset creation is **deprecated** for these features.

**Existing git-based text assets** created by these features are considered test data and can be safely abandoned.

### Affected APIs and Routes

#### Current Git-Based Routes (TO BE REFACTORED)

1. **`POST /api/text-assets`** (Layout Editor DOC save)
   - **Current**: Creates `content/timeline/{slug}/index.yaml` + `content.mdx`
   - **New**: Creates S3 JSON at `media-labeling/assets/{uuid}.json`
   - **Used by**: Layout Editor RteModal save handler

2. **`POST /api/chat/background-doc/start`** (Scribe start)
   - **Current**: Creates git files + enqueues via agent backend
   - **New**: Creates S3 text asset directly
   - **Used by**: LoreScribeModal, ComprehensiveTools, agent-lore route

3. **`POST /api/chat/background-doc/toggle`** (Scribe enable/disable)
   - **Current**: Updates YAML file `scribe_enabled` field
   - **New**: Updates S3 JSON `metadata.scribe_enabled` field
   - **Used by**: LoreScribeModal toggle functionality

### Required Code Changes

#### 1. Layout Editor DOC Button
**File**: `app/visual-search/components/Layout/LayoutEditorStandalone.tsx`

```typescript
// Current RteModal save logic (lines 2190-2192)
const payload = {
  slug: finalSlug,
  title: finalTitle,
  categories: cats,
  source: 'layout',
  status: 'draft',
  mdx: md,
  commitOnSave: commitPref
};
const res = await fetch('/api/text-assets', { ... });

// NEW: S3 text asset creation
const s3TextAsset = {
  id: crypto.randomUUID(),
  media_type: 'text',
  title: finalTitle,
  content: md,
  date: new Date().toISOString(),
  metadata: {
    slug: finalSlug,
    source: 'layout',
    status: 'draft',
    categories: cats,
    layout_id: edited.id, // Reference to creating layout
  },
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

const res = await fetch('/api/media-assets', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(s3TextAsset)
});
```

#### 2. Scribe Background Doc Start
**File**: `app/api/chat/background-doc/start/route.ts`

```typescript
// REPLACE entire route implementation
export async function POST(req: NextRequest) {
  try {
    const { conversationId, title, slug } = await req.json();

    if (!conversationId) {
      return NextResponse.json({ error: 'conversationId is required' }, { status: 400 });
    }

    // Generate unique slug and ensure uniqueness
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substr(2, 6);
    const finalTitle = title || `Conversation Summary ${timestamp}`;
    const baseSlug = slug || slugify(finalTitle);
    const finalSlug = await generateUniqueSlug(baseSlug);

    // Create S3 text asset
    const s3TextAsset = {
      id: crypto.randomUUID(),
      media_type: 'text',
      title: finalTitle,
      content: `# ${finalTitle}\n\n*The scribe will populate this document as your conversation continues...*`,
      date: new Date().toISOString(),
      metadata: {
        slug: finalSlug,
        source: 'conversation',
        status: 'draft',
        categories: ['lore', 'conversation'],
        scribe_enabled: true,
        conversation_id: conversationId,
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Save to S3 via media-assets API
    const response = await fetch(`${process.env.NEXTAUTH_URL}/api/media-assets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(s3TextAsset)
    });

    if (!response.ok) {
      throw new Error(`Failed to create S3 text asset: ${response.status}`);
    }

    const result = await response.json();

    return NextResponse.json({
      success: true,
      id: s3TextAsset.id,
      slug: finalSlug,
      title: finalTitle,
      conversationId,
      scribe_enabled: true,
      layoutId: null,
      layoutUrl: `/visual-search?highlight=${finalSlug}`
    });

  } catch (error) {
    console.error('[background-doc] S3 creation failed:', error);
    return NextResponse.json({
      error: 'Failed to create background document',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
```

#### 3. Scribe Toggle
**File**: `app/api/chat/background-doc/toggle/route.ts`

```typescript
// REPLACE with S3-based toggle
export async function POST(req: NextRequest) {
  try {
    const { slug, scribe_enabled } = await req.json();

    if (!slug || typeof scribe_enabled !== 'boolean') {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
    }

    // Find S3 text asset by slug
    const textAsset = await findTextAssetBySlug(slug);
    if (!textAsset) {
      return NextResponse.json({ error: 'Text asset not found' }, { status: 404 });
    }

    // Update scribe_enabled in metadata
    const updatedAsset = {
      ...textAsset,
      metadata: {
        ...textAsset.metadata,
        scribe_enabled
      },
      updated_at: new Date().toISOString()
    };

    // Save updated asset
    await saveMediaAsset(textAsset.id, updatedAsset);

    return NextResponse.json({
      success: true,
      id: textAsset.id,
      slug,
      scribe_enabled,
      message: scribe_enabled ? 'Scribe activated' : 'Scribe disabled'
    });

  } catch (error) {
    console.error('[background-doc] Toggle failed:', error);
    return NextResponse.json({
      error: 'Failed to toggle scribe',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
```

### Reference Format Updates

#### Layout Content References
```typescript
// OLD git-based reference
{
  type: 'content_ref',
  contentType: 'text',
  refId: 'text_timeline/my-story',  // ❌ Git-based
  contentId: 'text_timeline/my-story'
}

// NEW S3-based reference
{
  type: 'content_ref',
  contentType: 'text',
  refId: '550e8400-e29b-41d4-a716-446655440000', // ✅ UUID-based
  contentId: '550e8400-e29b-41d4-a716-446655440000'
}
```

#### Scribe Document References
```typescript
// OLD: Slug-based document tracking
setDocumentData({
  slug: result.slug,           // ❌ Git slug
  title: result.title,
  // ...
});

// NEW: UUID-based document tracking
setDocumentData({
  id: result.id,               // ✅ S3 UUID
  slug: result.slug,           // For display/URLs only
  title: result.title,
  // ...
});
```

### Backward Compatibility

During transition period:
- **Reading**: Support both git (`text_timeline/{slug}`) and S3 (UUID) references
- **Writing**: S3-only for scribe and DOC features
- **Existing layouts**: Continue to work with git-based references until migrated

### Testing Strategy

1. **Create new DOC in layout editor** → Verify S3 storage
2. **Start scribe in conversation** → Verify S3 creation
3. **Toggle scribe on/off** → Verify S3 metadata updates
4. **Layout rendering** → Verify S3 content loading
5. **Existing git references** → Verify fallback still works

---

## Benefits Over Git Storage

1. **No Deploy Triggers**: S3 writes don't trigger Vercel rebuilds
2. **Rapid Editing**: Direct JSON updates vs git commit overhead
3. **UUID References**: Stable references vs fragile slug dependencies
4. **Rich Metadata**: Flexible arrays for tagging and relationships
5. **Performance**: S3 + CDN vs GitHub API latency
6. **Scalability**: No git repository size constraints
7. **Consistency**: Same pattern as existing media assets

---

## Backward Compatibility

### During Transition
- **Dual-read support**: Check S3 first, fallback to git
- **Reference mapping**: `text_timeline/{slug}` → resolve to UUID
- **API compatibility**: Existing endpoints work with both systems
- **Migration tracking**: `migrated_from_git` flag for status

### Long-term
- **Git system**: Remains for Keystatic-created content
- **S3 system**: Default for all new programmatic content
- **Clean separation**: No cross-contamination between systems
