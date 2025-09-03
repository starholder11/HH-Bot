## NARRATIVE_GRAPHS
### Unified Product and Technical Specification for Text-Rooted Narrative Relationship Architecture

---

## Executive Summary
Narrative Graphs turns conversational text into a coherent, explorable graph of entities, scenes, and relationships without interrupting creative flow. Text created in conversations is immediately searchable by the lore agent via OpenAI File Search, while graph enrichment (entity detection, relationship creation) runs in the background and canonical publication to GitHub is deferred. The graph model prevents cross-link explosion by separating persistent entities from scene-bounded instances, so meaning flows upward to the entity layer rather than laterally across scenes.

This specification consolidates and replaces Shadow Creation and Shadow Graphs with a single, precise architecture that reuses our existing infrastructure (S3 JSON storage, Redis context, SQS + Lambda workers, LanceDB, agent system) and introduces Neo4j as the relationship store.

---

## Non-Negotiable Constraints
- Immediate lore visibility: on every save, upsert MDX to OAI File Search (hash-gated) so the lore agent remains current; canonical ingest via webhook remains gated by YAML `status` and separate from OAI sync.
- Deferred canonicalization: GitHub commits happen later in batches; do not couple conversational writes with publication.
- Infra reuse: S3 for JSON docs, Redis for context/state, SQS/Lambda for background jobs, LanceDB for unified search, agent orchestrator for workflows.
- Graph sanity: one entity per concept per canonical graph; scene-bounded instances; no cross-scene instance links; cross-scene meaning lives at the entity layer.

---

## Vision and Product Objectives

### Primary Objectives
1. **Seamless Creation Flow**: Enable uninterrupted creative conversation while automatically building supporting media
2. **Contextual Intelligence**: Generate media that meaningfully supports and enhances narrative elements
3. **Persistent Worldbuilding**: Transform conversations into lasting timeline entries with rich multimedia support
4. **Interconnected Universe**: Create relationships between media elements that reflect narrative connections
5. **Effortless Discovery**: Surface relevant existing content alongside new creations

### Secondary Objectives
1. **Cost Efficiency**: Generate only high-value media with strong narrative relevance
2. **User Control**: Provide oversight and curation capabilities without interrupting flow
3. **Technical Scalability**: Handle multiple concurrent conversations and generation requests
4. **Quality Assurance**: Ensure generated content meets Starholder universe standards

## Target User Personas

### Primary: The Starholder Storyteller
- **Profile**: Creative individuals building the Starholder universe through conversation
- **Pain Points**: Breaking creative flow to manually request supporting media; losing context between conversations; difficulty maintaining consistency across media
- **Goals**: Focus on storytelling while building rich, interconnected narrative experiences
- **Success Metrics**: Time spent in creative flow; richness of generated timeline entries; interconnectedness of created content

### Secondary: The Starholder Explorer
- **Profile**: Users discovering and interacting with existing Starholder content
- **Pain Points**: Difficulty finding related content; static, disconnected media experiences
- **Goals**: Deep exploration of interconnected narrative elements
- **Success Metrics**: Depth of content exploration; discovery of related materials; engagement with multimedia experiences

### Tertiary: The Starholder Curator
- **Profile**: Users who organize, refine, and enhance existing content
- **Pain Points**: Manual effort required to create relationships between content; difficulty identifying content gaps
- **Goals**: Maintain coherent, high-quality universe with rich interconnections
- **Success Metrics**: Content quality improvements; relationship density; universe coherence

---

## Core Architectural Principles
- Text roots as semantic anchors: every chunk of text (scene excerpt, description, note) is a first-class source of relationships and manifestations.
- Entity–Instance separation: persistent entity nodes and scene-bounded instance nodes enforce clean relationship scopes.
- Upward meaning flow: intra-scene relationships occur only among instances; cross-scene relationships occur only among entities.
- Canonical vs derivative: canonical graphs are immutable; derivatives inherit canon selectively and evolve independently.
- Lore oracle: the lore agent’s vector-store-backed file search arbitrates whether an entity already exists in the universe.

---

## Stack Justifications
- Neo4j for storage: graph-first queries (paths, neighborhoods, weighted relations) match narrative exploration; supports APOC, constraints, and performant traversals; better developer ergonomics than forcing relational joins for graph semantics.
- 3d-force-graph + Three.js for viz: proven for large interactive networks in the browser; flexible custom node/link rendering (thumbnails, sprites), good performance with freeze/tiling techniques.
- AI pipeline (OpenAI/Anthropic): robust text decomposition/relationship discovery; compatibility with file search tools; controllable temperature and token budgets; easy to integrate with our existing SDKs.
- S3 + Redis + SQS/Lambda + LanceDB: all are already running in production; we extend rather than replace.

---

## System Overview

### Ordering of Operations (authoring → explore → formalize)
1) Integrated lore-scribe creation
   - User engages in lore conversation, optionally activates scribe with "start scribe [topic]"
   - Scribe creates flowing narrative content in real-time, saves as draft (YAML+MDX) with `status: draft`, `scribe_enabled: true`
   - OAI sync runs immediately on save (hash-gated). Webhook ingest runs only when `status: committed` after manual/cron Git commit
   - User controls AI assistance with "stop scribe" / "start scribe" commands that update YAML persistence

2) Background processing
   - Queue entity detection job → extract candidates, resolve against lore vector store, create/update entities and instances in Neo4j.
   - Queue relationship analysis job → intra-scene instance links; periodic roll-up into cross-scene entity relationships.

3) Canonicalization (publish)
   - User flips `status: committed` (or runs formalize) → webhook ingests; OAI sync remains independent.
   - Existing webhook path updates LanceDB; canon graph is marked complete/immutable; derivatives may be spawned.

---

## Processing Pipeline (Five‑Agent Mapping)

We retain the essence of the five-agent concept as concrete services/stages (not literal agent processes) to keep the flow observable and scalable:

1) Stenographer (Conversation → Text Roots)
- Responsibility: break conversation text into text roots with anchors, constraints, and narrative metadata.
- Output: `TextRoot[]` with spans, `semantic_hash`, `manifestation_potential`, `constraints`.

2) Media Curator (Opportunity Detection)
- Responsibility: analyze text roots to prioritize generation opportunities across modalities; locate relevant existing assets.
- Output: prioritized queue of generation requests + candidate existing assets with relevance scores.

3) Generation Executor (Factory Orchestration)
- Responsibility: call visual/audio/video/spatial factories, enforce constraints, perform semantic validation, save assets, and link manifestations.
- Output: saved `MediaAsset` JSON (S3), `Manifestation` nodes with fidelity scores, cross-modal `COMPLEMENTS` edges.

4) Spatial Composer (Layout/Space Projection)
- Responsibility: project relationships into 2D/3D coordinates (timeline, layout, space) using weight-aware strategies; provide view-state hints for clients.
- Output: layout configs, space configs, timeline DAG hints; cached subgraph tiles for visualization.

5) World Formalizer (Canonization & Vectorization)
- Responsibility: finalize canonical graphs, perform vectorization (embeddings) where needed, manage derivative inheritance, and coordinate publication (GitHub commits → webhook → LanceDB updates).
- Output: immutable canon graphs, derivative baselines, updated indexes.

These are implemented as queue-driven stages (SQS/Lambda) with Redis-based orchestration and reporting, not monolithic agents.

---

## Prompting & Token Budgets (Decomposition & Relationship Discovery)

### Text Decomposition
- Model: Claude 3.5 Sonnet (primary), GPT‑4o mini (fallback)
- System: “Break text into semantic roots (5–50 words). Extract abstraction, emotional tone [0–1], narrative function, manifestation viability, constraints.”
- Max tokens: 3k per scene chunk (split long scenes); temperature 0.1; schema‑validated JSON output; retry on invalid JSON.

### Relationship Discovery
- Model: Claude 3.5 Sonnet (primary), GPT‑4o (fallback)
- System: “Identify thematic/causal/character/setting/emotional relationships between provided text roots. Provide weight [0–1], confidence, bidirectionality, evolution potential. Cite source text root IDs.”
- Max tokens: 4k; temperature 0.1; batch by chapter or ≤ 50 roots per call; throttle to avoid rate limits.

---

## Components and Responsibilities
- S3 JSON storage: conversational/draft timeline-compatible docs; canonicalized docs (via GitHub) remain source-of-truth for publication.
- OpenAI File Search (Lore Vector Store `vs_6860128217f08191bacd30e1475d8566`): single source of truth for lore presence checks; immediate uploads from conversations.
- Neo4j graph service: stores TextRoots, Entities, Instances, Scenes/Chapters, Manifestations, and relationships with weights and provenance.
- SQS + Lambda workers: entity detection, resolution, relationship creation, periodic consolidation, retry/backoff.
- Redis context: per-user narrative graph state, draft doc tracking, job statuses; same key naming and TTL policies as existing context.
- LanceDB: unified search across all content (optional text updates at formalization time; conversational text is primarily for lore visibility).
- Agent system: orchestrates UI-visible steps (save text, show results) and defers background work to queues; extends existing tool registry with narrative graph tools.

---

## Semantic Text Anchors and Constraints

### Text Root Anchoring
- Each `TextRoot` stores source offsets (start/end) into its parent document, with stable `semantic_hash` for dedup and change tracking.
- Anchors persist across revisions by matching via `semantic_hash` first, then fallback fuzzy match window around prior offsets.
- Constraints:
  - `must_include`: required elements (characters, settings, objects) that all manifestations must honor.
  - `style_consistency`: style/mood requirements (e.g., narrative_realism, cinematic_wide_shot).
  - `emotional_range`: numeric band that manifestations should stay within.

### Anchor → Graph Mapping
- `TextRoot` → `Scene` via CONTAINS, ordered by `narrative_position.sequence_order`.
- `EntityInstance` → `TextRoot` via APPEARS_IN; stores the exact sentence/phrase spans that ground the instance.
- Relationship provenance on edges references anchor spans and doc slugs for auditability.

---

## Media Generation Factories and Integration

### Overview
- Reuse existing media asset pipeline (S3 JSON, labeling, indexing). Manifestations reference existing `MediaAsset` IDs; no duplication.
- Triggered from prioritized `TextRoot` candidates (by manifestation potential and narrative importance) or from user actions.

### Visual Factory (Images)
- Input: `TextRoot` content + constraints + optional entity profile hints.
- Prompt engineering merges: anchor text, `must_include`, `style_consistency`, and consistent seed derived from `entityId` (for persistent look).
- Output: image URL (S3/Cloudflare), `MediaAsset` JSON saved via existing `saveMediaAsset`, `Manifestation` node linked via GENERATES.

### Audio Factory (Ambient/SFX/Voice)
- Input: `TextRoot` mood + setting + entity context.
- Ambient: generate 20–60s SFX bed (wind, grove ambience). Voice/narration optional; keep separate subtype.
- Output: audio URL, asset JSON, `Manifestation` with `audio_subtype` and fidelity scores (to mood/setting).

### Video Factory (I2V / scene stubs)
- Input: reference image(s) + anchor text + motion intent.
- Output: short clip (2–10s) with metadata; keyframes emitted back into pipeline; link via `COMPLEMENTS` to visuals/audio.

### Spatial Factory (3D hints)
- Input: setting description + object list (from anchors/entities).
- Output: environment payload (model refs or layout schema) saved as `SpaceAsset`; `Manifestation` links to asset with environment type.

### Quality and Consistency
- Semantic Validator checks: content_accuracy, style_consistency, constraint_compliance, emotional_fidelity (0.0–1.0 each), overall.
- Below-threshold outputs flagged for regeneration; auto-regenerate up to N attempts with adjusted prompts; else `requires_review`.

---

## Graph Visualization Modes

### Timeline Mode (2D enhanced linear)
- Layout: left-to-right DAG; `TextRoot` nodes along main axis; auxiliary layers at fixed depths: Character, Setting, Theme, Manifestation.
- Interactions: hover reveals anchor snippet and manifestations; click drills into scene-level instances.
- Data API: fetch ordered `TextRoot`s by (chapter, scene, sequence_order) with sampled manifestations.

### Spatial Mode (3D constellation)
- Nodes: Entities (larger), Instances (smaller, translucent), Manifestations (thumbnail-textured spheres when visual), TextRoots (dim anchors).
- Edges: Entity-level links weighted (thickness) and typed (dash/color mapping); instance-level only rendered within selected scene cluster.
- Controls: focus/defocus on entity; expand neighborhood by weight threshold; smooth camera moves; lazy-load clusters.

#### 3d-force-graph Integration (Web)
- Library: `3d-force-graph` with Three.js for custom node/link objects.
- Data contract (client):
  - `nodes`: `{ id, type, label, properties, previewUrl? }`
  - `links`: `{ source, target, weight, type, properties }`
- Rendering rules:
  - Node color by type: Entity (accent), Instance (muted), Manifestation (image-textured), TextRoot (anchor gray).
  - Link width = `min(6, 1 + weight * 4)`; opacity by weight.
  - `nodeThreeObject`:
    - Entities: sphere with emissive material; label sprites.
    - Manifestations (visual): apply image texture thumbnail.
  - `linkDirectionalParticles`: show for weights ≥ threshold to indicate strong flow.
- Interaction:
  - `onNodeClick`: camera transition to node; open side panel with details (profile, anchors, manifestations).
  - `onLinkClick`: show edge metadata and evidence count; allow filtering by type.
- Performance:
  - Use `cooldownTicks` with dynamic damping; freeze positions after idle.
  - Paginate/virtualize nodes: fetch additional neighbors on zoom/focus.
  - Offload heavy transforms to workers where available.

#### Spatial Renderer API
- GET `/api/graphs/:canonId/spatial?focus=<nodeId>&depth=<n>&minWeight=<w>`
  - Returns pre-filtered subgraph for 3D view.
  - Server enforces node/edge caps (e.g., 1500 nodes/3000 links) and weight threshold.
  - Includes signed preview URLs for image-textured manifestation nodes.

### Network Mode (relationship analysis)
- Pure relationship view: Entities only; filters by relationship type (thematic/causal/setting/emotional), weight threshold, evidence count.
- Pathfinding: strongest paths between entities; highlight corridors (thematic highways).

### Performance
- Subgraph loading: depth-limited cluster fetch around focus nodes; server-side pre-filtering by weight and node caps.
- Caching: Redis-backed snapshots of cluster data keyed by (canonId, viewType, focus, thresholds).

### Derivative Graph Visualization
- Derivatives render with the same engine; nodes inherited from canon are styled with a subtle ring; user-modified edges are highlighted.
- Toggle to show/hide derivative-only content; diff overlay for relationship changes.

---

## Cross-Modal Relationship Discovery
- Multi-modal embeddings: map text roots, image captions/labels, audio descriptors into a shared vector space (reuse existing labeling metadata + OpenAI embeddings).
- COMPLEMENTS edges between manifestations (e.g., visual ↔ audio) created when embeddings exceed similarity threshold and share anchor/entity context.
- Feedback loop: if users co-view certain manifestation pairs frequently, increase `COMPLEMENTS` weight (bounded), and suggest bundling in UI.

---

## Neo4j Indexing & Query Optimizations
- Indexes:
  - `(:TextRoot {canonId})`, `(:TextRoot {narrative_position.sequence_order})`
  - `(:Entity {canonId, canonical_name})`, `(:EntityInstance {sceneId, entityId})`
  - Relationship property index on `weight` for common types
- Query patterns:
  - Timeline: order by (chapter, scene, sequence_order) with optional `FOLLOWED_BY*0..1` traversal.
  - Spatial subgraph: use path expansion with depth and weight filters; cap results.
  - Entity neighborhood: collect top-K neighbors by weight with evidence counts.

---

## Concrete API Payloads

### Spatial Graph Response
```json
{
  "nodes": [
    { "id": "ent_shadow001_almond_al", "type": "Entity", "label": "Almond Al", "properties": { "status": "existing" } },
    { "id": "ins_shadow001_scene_001_almond_al", "type": "EntityInstance", "label": "Al in Scene 1", "properties": { "sceneId": "scene_shadow001_001" } },
    { "id": "text_root_shadow001_abc", "type": "TextRoot", "label": "Almond Al stood in…", "properties": { "sequence": 1 } },
    { "id": "manif_img_123", "type": "Manifestation", "label": "Grove Wide Shot", "properties": { "previewUrl": "https://…/thumb.jpg" } }
  ],
  "links": [
    { "source": "ins_shadow001_scene_001_almond_al", "target": "ent_shadow001_almond_al", "type": "INSTANCE_OF", "weight": 1.0, "properties": {} },
    { "source": "ins_shadow001_scene_001_almond_al", "target": "text_root_shadow001_abc", "type": "APPEARS_IN", "weight": 1.0, "properties": { "span": [120, 168] } },
    { "source": "ent_shadow001_almond_al", "target": "ent_shadow001_grove", "type": "THEMATIC", "weight": 0.78, "properties": { "evidence_count": 4 } }
  ],
  "meta": { "canonId": "canon_graph_001", "generatedAt": "2025-01-01T00:00:00Z" }
}
```

### Entity Oracle Request/Response
```json
// Request
{ "entityName": "Almond Al", "typeHint": "person", "contextSnippets": ["…withering grove…"] }

// Response
{ "exists": true, "canonicalName": "Almond Al", "knowledge": "Almond Al is…", "aliases": ["Al"], "provenance": [{"slug":"about/almond_al"}] }
```

---

## QA, Validation, and Coherence

### Semantic Fidelity
- Validator compares manifestation prompts and outputs against anchor constraints; assigns per-dimension scores; stores on `Manifestation`.
- Thresholds configurable; below-threshold assets marked for regen or manual review.

### Relationship Coherence
- Batch validator checks newly created edges for logical consistency (e.g., causal claims need textual evidence in ≥ 2 scenes).
- Flags contradictory edges; suggests merges or prunes for low-evidence weak links.

### Data Integrity
- Orphan checks: nodes not reachable from canon root via CONTAINS* must be zero; reports include sample IDs.
- Weight sanity: all weights in [0,1]; invalid weights quarantined and corrected.

### Corruption Detection & Repair
- Scans:
  - Malformed JSON properties on nodes (manifestation_potential, constraints)
  - Missing mandatory relationships (e.g., TextRoot without Scene)
  - Broken lineage (Manifestation without parent TextRoot)
- Repair Plan:
  - Auto-infer missing relationships from `narrative_position` and anchors
  - Quarantine nodes with unrecoverable properties; emit repair tickets
  - Report: { issues_detected, repairs_attempted, repairs_successful, remaining_issues }

---

## Analytics, Monitoring, and Reinforcement

### Usage Analytics
- Track interactions: node clicks, relationship follows, manifestation views; session-level metrics.
- Relationship reinforcement: only for Entity-level edges when users traverse/linger on that connection; small bounded increments (e.g., +0.03).

### Health and Performance
- Queue depth monitoring; retry counts; vector store latency; Neo4j query timings; cache hit rates.
- Dashboards: per-canon graph summaries (nodes/edges counts, strongest links, most-viewed manifestations).

### Reports
- Graph evolution snapshots: changes in relationship strengths over time; newly formed thematic clusters.
- Content effectiveness: manifestation effectiveness scores aggregated by type/subtype.

---

## Data Models

### Node Types (Neo4j constraints)
```cypher
// Canonical graph root
CREATE CONSTRAINT canon_unique IF NOT EXISTS
FOR (c:CanonGraph) REQUIRE (c.id) IS UNIQUE;

// Text root (semantic unit from a doc/scene)
CREATE CONSTRAINT textroot_unique IF NOT EXISTS
FOR (t:TextRoot) REQUIRE (t.id) IS UNIQUE;

// Entity (persistent concept: person/place/object/concept/org)
CREATE CONSTRAINT entity_unique IF NOT EXISTS
FOR (e:Entity) REQUIRE (e.id) IS UNIQUE;
CREATE CONSTRAINT entity_name_canon_unique IF NOT EXISTS
FOR (e:Entity) REQUIRE (e.canonId, e.canonical_name) IS UNIQUE;

// Scene-bounded instance of an entity
CREATE CONSTRAINT instance_unique IF NOT EXISTS
FOR (i:EntityInstance) REQUIRE (i.id) IS UNIQUE;
CREATE CONSTRAINT instance_by_scene_entity IF NOT EXISTS
FOR (i:EntityInstance) REQUIRE (i.sceneId, i.entityId) IS UNIQUE;

// Scenes/Chapters
CREATE CONSTRAINT scene_unique IF NOT EXISTS
FOR (s:Scene) REQUIRE (s.id) IS UNIQUE;
CREATE CONSTRAINT chapter_unique IF NOT EXISTS
FOR (ch:Chapter) REQUIRE (ch.id) IS UNIQUE;

// Manifestation (references existing media asset)
CREATE CONSTRAINT manifest_unique IF NOT EXISTS
FOR (m:Manifestation) REQUIRE (m.id) IS UNIQUE;
```

### Entity Node (normalized identity; one per canon graph)
```json
{
  "id": "ent_shadow001_almond_al",
  "label": "Entity",
  "canonId": "canon_graph_001",
  "canonical_name": "Almond Al",
  "type": "person",
  "aliases": ["Al", "Almond Albert"],
  "profile": {
    "roles": ["farmer", "philosopher"],
    "attributes": {
      "age_range": "elderly",
      "personality": ["contemplative", "resilient"]
    },
    "affiliations": [],
    "motifs": ["drought", "scarcity_vs_abundance"]
  },
  "provenance": [
    { "slug": "about/almond_al", "hash": "deadbeef", "source": "lore" },
    { "slug": "conv_123/shard_1", "hash": "cafebabe", "source": "conversation" }
  ],
  "status": "existing|new|ambiguous",
  "needs_review": false,
  "created_at": "ISO8601",
  "updated_at": "ISO8601"
}
```

### EntityInstance Node (scene-bounded usage)
```json
{
  "id": "ins_shadow001_scene_001_almond_al",
  "label": "EntityInstance",
  "entityId": "ent_shadow001_almond_al",
  "sceneId": "scene_shadow001_001",
  "textRootId": "text_root_shadow001_abc",
  "emotional_state": "melancholic",
  "actions": ["tracing bark", "standing in grove"],
  "physical_description": ["weathered hands"],
  "dialogue_snippets": [],
  "created_at": "ISO8601",
  "updated_at": "ISO8601"
}
```

### Relationship Types and Bounds
- INSTANCE_OF: EntityInstance → Entity (always)
- APPEARS_IN: EntityInstance → TextRoot (always)
- INTERACTS_WITH: Instance ↔ Instance (same scene only)
- THEMATIC / CAUSAL / SETTING / EMOTIONAL: Entity ↔ Entity (cross-scene allowed)
- FOLLOWED_BY: TextRoot → TextRoot (narrative flow)
- CONTAINS: Chapter/Scene containing TextRoots/Entities (structural)

Forbidden:
- Instance ↔ Instance across scenes (prevents cross-scene sprawl)
- TextRoot ↔ Entity across scenes except via INSTANCE_OF

---

## Factory Integrations (Canvas/Generation/Analysis/Layout/Space)

### Canvas Factory
- Input: individual assets or manifestations.
- Operation: create/maintain `part_of` relationships between assets and canvas collections; persist canvas JSON via existing S3 write helpers.
- Graph effect: `(:Asset)-[:PART_OF {canvasId, order}]->(:Canvas)`; canvas treated as collection asset and as a grouping relationship on the graph.

### Generation Factory
- Input: `TextRoot` + prioritized generation request.
- Operation: orchestrate model calls, capture prompts/params, save `MediaAsset`, upsert `Manifestation`, set lineage.
- Graph effect: `(:TextRoot)-[:GENERATES {type, semantic_fidelity, model, ts}]->(:Manifestation)`;
  `(:Manifestation)-[:DERIVES_FROM]->(:Entity)` optional when entity-driven look is used.

### Analysis Factory
- Input: conversation text + asset library.
- Operation: discover semantic relationships, detect themes, compute weights/confidence; backfill entity profiles.
- Graph effect: upsert `RELATES_TO`, `THEMATIC`, `SETTING`, `EMOTIONAL` edges with provenance + evidence counts.

### Layout Factory
- Input: graph subset + rendering configs.
- Operation: project relationships to 2D timeline/layout coordinates; generate hints for clients.
- Graph effect: store `rendering_configs` on `CanonGraph`/`DerivativeGraph`; optional node position hints for cached views.

### Space Factory
- Input: graph subset + space strategy.
- Operation: project relationships to 3D coordinates (constellation or clustered spheres); compute scale/spacing; provide texture refs for manifestations.
- Graph effect: same as Layout Factory, but 3D config; cache subgraph tiles keyed by focus/thresholds.

---

## Text Flow and Storage

### Authoring and Ingestion
- Save conversation text to S3 as timeline-compatible JSON + MDX:
  - path: `content/timeline/{docId}/index.json` and `content/timeline/{docId}/content.mdx`
  - include metadata: slug, title, date, categories, source="conversation", status="draft".
- Immediately upload the MDX body to the lore vector store (OpenAI File Search) so the lore agent is up to date.
- Do not trigger GitHub commit; defer canonicalization.

### Formalization
- User selects drafts → batch commit to GitHub (`index.yaml`, `content.mdx`) using existing GitHub updater.
- Webhook triggers, and the existing flow updates LanceDB (unified search) as today.
- Mark docs “committed”; link doc slugs to canon graph.

---

## Entity Detection and Resolution

### Extraction (conservative, high recall)
- Identify candidate entities: name, type (person/place/object/concept/org), spans, confidence, local context.
- Normalize names: lowercase, strip punctuation, collapse whitespace, drop honorifics. Record `name_original` and `name_normalized`.
- Discard confidences < 0.7 unless repeated in doc ≥ 2 times.

### Lore Oracle Resolution (vector store)
- Query the lore vector store (`vs_6860128217f08191bacd30e1475d8566`) with normalized name + type hint + 1–2 context snippets (top-k ≈ 8).
- Existing if at least 2 chunks from distinct docs mention the name or accepted alias with similarity ≥ 0.80 and match type.
- Aliases accepted if similarity ≥ 0.85 across ≥ 2 chunks or explicit alias cues ("aka", "called").
- Ambiguous if exactly one high-similarity chunk (≥ 0.83) and others < 0.75; create provisional entity with `needs_review=true`.
- Cache resolution decisions in Redis:
  - key: `entity:resolve:{normalized_name}`
  - value: { status, canonical_name, alias_of?, decided_at }
  - TTL: 24 hours; invalidate on corpus size growth threshold or alias map change.

### Creation and Enrichment
- Entities (existing): create (or update) Entity node once; enrich profile from retrieved lore chunks; add provenance (slugs, hashes).
- Entities (new): create from conversation context; mark provenance “graph-local”; status “new”; keep revision trail as more evidence appears.
- Scene instances: one per (scene, entity); carry emotional/actions/looks/dialogue only.

---

## Relationship Creation and Weights

### Instance-Level (within-scene only)
- INTERACTS_WITH: create when two instances co-occur with action or relation cues; weight = min(0.9, 0.5 + 0.1 × #explicit cues), pure co-occur ≤ 0.6.
- SUPPORTS / CONTRASTS: created from emotion/theme polarity in the same scene; weight based on polarity similarity/distance.

### Entity-Level (cross-scene)
- THEMATIC: ≥ 3 scenes contain both entities with high semantic similarity; initial weight 0.7; reinforced by usage analytics.
- CAUSAL: explicit causal phrasing in ≥ 2 distinct scenes; initial weight 0.8; store `evidence_count`.
- CHARACTER_ARC: stored as trajectory metrics on the Entity (not edges): emotion trend, role shifts, turning points.

### Weight Governance and Provenance
- All weights clamped to [0.0–1.0].
- Each edge stores discovery_method, confidence, evidence_count, last_updated.
- Reinforcement (from interaction analytics) applies to Entity-level edges only.

---

## Identity, Idempotency, and Keys
- Entity id: `ent_{canonId}_{slug(canonical_name)}`
- Instance id: `ins_{canonId}_{sceneId}_{slug(canonical_name)}`
- Relationship id: hash of `{sourceId|targetId|type|sceneId?}` to upsert instead of duplicate.
- Uniqueness constraints (Neo4j) enforce one Entity per (canonId, canonical_name) and one Instance per (sceneId, entityId).
- Alias lists stored sorted, lowercase, deduped.

---

## Queues and Background Jobs

### Standard Queue Payload (extends existing)
```jsonc
{
  "assetId": "text-doc-id-or-slug",
  "mediaType": "text",
  "requestedAt": 1735590000000,
  "stage": "narrative_graph_processing",
  "extra": {
    "processingType": "entity_detection" | "relationship_analysis" | "consolidation",
    "conversationId": "conv_123",
    "canonId": "canon_graph_001",
    "sceneHints": ["scene_001", "scene_002"],
    "textRootIds": ["text_root_abc", "text_root_def"]
  }
}
```

### Worker Responsibilities
- entity_detection: extract candidates → resolve via lore vector store → create/update Entities → create scene Instances → emit relationship_analysis.
- relationship_analysis: create within-scene instance links → enqueue consolidation.
- consolidation (batch): roll up scene evidence into entity-level edges; recompute weights; prune weak links (< 0.3 and evidence < 2).

Retry/backoff: exponential up to 24h for vector store or graph service outages. Mark unresolved items "unknown_pending".

### Integration with Existing Agent System
- Narrative Graphs tools added to existing tool registry (`services/tools/ComprehensiveTools.ts`)
- Correlation IDs flow from agent requests through all processing stages for debugging
- Background jobs inherit correlation ID from triggering conversation
- `__agentApi` handlers extended with graph visualization and text creation actions

---

## APIs (spec-level; reusing existing routes where possible)

### Integrated Lore-Scribe System
- **Modal interface**: Tabbed lore chat + document editor in single modal
- **Scribe commands**: "start scribe [topic]" / "stop scribe" with fuzzy intent matching
- **Adaptive summarization**: Literary narrative style, responsive to conversation directives
- **YAML control**: `scribe_enabled` field persists user preferences across sessions
- **Document-as-context**: Resume conversations using existing text asset content (no chat persistence needed)
- **Immediate OAI sync**: Upload MDX body to lore vector store on every scribe update

### Entity oracle (non-streaming lore check)
- Endpoint: `/api/narrative-graphs/entity-oracle`
- Input: { entityName, typeHint?, contextSnippets[] }
- Behavior: Query lore vector store (`vs_6860128217f08191bacd30e1475d8566`) without streaming; return { exists: boolean, canonicalName?, knowledge? }
- Used by workers during resolution; not a user-facing UI endpoint.

### Graph service (internal)
- Create/update entity, create instance, create instance-level edge; idempotent by IDs described above.
- Query subsets for visualization (by scene, by entity cluster, by weight threshold).

### GraphQL Schema (public API surface)
```graphql
type CanonGraph { id: ID!, title: String, version: String, metadata: GraphMetadata, chapters: [Chapter!]!, textRoots: [TextRoot!]!, manifestations: [Manifestation!]!, analytics: GraphAnalytics }
type Chapter { id: ID!, title: String, order: Int }
type Scene { id: ID!, chapterId: ID!, order: Int, title: String }
type TextRoot { id: ID!, content: String!, narrativePosition: NarrativePosition!, constraints: ConstraintParameters, manifestations: [Manifestation!]!, relatedRoots(first: Int, weight: Float): [TextRootRelationship!]! }
type Manifestation { id: ID!, parentTextRoot: TextRoot!, manifestationType: ManifestationType!, assetReference: String!, generationMetadata: GenerationMetadata, semanticFidelity: SemanticFidelity }
type TextRootRelationship { source: TextRoot!, target: TextRoot!, relationshipType: RelationshipType!, weight: Float!, confidence: Float!, evidenceCount: Int }

enum ManifestationType { VISUAL AUDIO SPATIAL VIDEO }
enum RelationshipType { THEMATIC CAUSAL CHARACTER SETTING EMOTIONAL TEMPORAL }

type Query {
  canonGraph(id: ID!): CanonGraph
  textRoot(id: ID!): TextRoot
  manifestation(id: ID!): Manifestation
  exploreSemanticCluster(textRootId: ID!, maxDepth: Int = 2, weightThreshold: Float = 0.5): [TextRootRelationship!]!
  timelineSequence(canonId: ID!, chapter: Int, scene: Int): [TextRoot!]!
  findSimilarContent(textRootId: ID!, similarityThreshold: Float = 0.7, limit: Int = 10): [TextRoot!]!
}

type Mutation {
  createCanonGraph(input: CreateCanonGraphInput!): CanonGraph!
  processCanonicalContent(canonId: ID!): ProcessingJob!
  createDerivativeGraph(input: CreateDerivativeInput!): DerivativeGraph!
  addManifestationToDerivative(derivativeId: ID!, textRootId: ID!, manifestationType: ManifestationType!): GenerationJob!
  strengthenRelationship(sourceId: ID!, targetId: ID!, weightIncrease: Float!): TextRootRelationship!
}

type Subscription {
  processingProgress(canonId: ID!): ProcessingProgress!
  manifestationGenerated(textRootId: ID!): Manifestation!
  relationshipEvolution(canonId: ID!): RelationshipUpdate!
}
```

### REST Endpoints (selected)
- POST `/api/v1/canon-graphs` → create canon graph from timeline JSON
- GET `/api/v1/canon-graphs/:canonId/graph-data` → { viewType, focusNode, maxDepth }
- POST `/api/v1/canon-graphs/:canonId/derivative` → spawn derivative graph
- GET `/api/v1/text-roots/:textRootId/manifestations` → list
- WS channels: `processing:{canonId}`, `manifestations:{textRootId}`

### Formalization (batch)
- Batch-commit selected S3 drafts to GitHub; webhook-based LanceDB update runs as today.

---

## Redis Context Extension (additive; maintains existing TTLs)
```json
{
  "narrativeGraphs": {
    "activeConversationId": "conv_123",
    "draftTextDocs": [
      { "docId": "shadow-173559001", "title": "Withered Grove", "created_at": "ISO8601", "status": "draft|processing|ready|committed" }
    ],
    "entityDetectionJobs": [
      { "jobId": "job_abc", "textDocId": "shadow-173559001", "status": "queued|processing|completed|failed",
        "entities": [{ "name": "Almond Al", "type": "person", "loreStatus": "existing|new|ambiguous" }] }
    ],
    "lastGraphActivity": "ISO8601"
  }
}
```
- Enforce caps to prevent bloat: keep last 50 drafts, last 100 jobs.

---

## Failure Modes and Recovery
- Vector store unavailable: mark entities “unknown_pending”; retry with backoff; do not create global entity; allow provisional in derivative graph.
- Ambiguity after retries: keep provisional with `needs_review=true`; UI can present “Review needed: possible alias of {X}”.
- Canonical name changed (later evidence): migrate instances via alias map; keep old canonical name in alias list for continuity.
- Graph writes fail: requeue job with jittered backoff; partial writes are idempotent via IDs and constraints.

---

## Performance and Cost Controls
- Batch entity detection across multiple text roots from the same doc.
- Cache resolution results (Redis) for 24h to avoid repeated vector store calls.
- Limit per-scene instance creation by normalization and dedup (one per (scene, entity)).
- Consolidation runs on timers or thresholds (e.g., every N scenes added).
- Weight recalculation favors incremental updates; only recompute affected subgraphs.

---

## User Journey and Experience Design

### The Seamless Creation Experience

**Stage 1: Natural Conversation**
The user engages in natural conversation with the lore agent about Starholder elements - characters, locations, events, themes, or concepts. The conversation flows naturally without interruption or awareness of background processing.

*Example: User discusses "Almond Al, the philosopher-farmer who tends drought-stricken groves while contemplating the nature of scarcity and abundance."*

**Stage 2: Intelligent Analysis (Invisible)**
The system analyzes the conversation in real-time, identifying:
- Visual elements that could be depicted
- Audio elements that could enhance the narrative
- Existing content that relates to the discussion
- Thematic connections to other timeline entries
- Spatial and temporal relationships

**Stage 3: Contextual Generation (Background)**
The system automatically begins generating supporting media:
- Character portraits based on descriptions
- Landscape images of mentioned locations
- Ambient audio that matches described atmospheres
- Searches for related existing content
- Text synthesis that formalizes the narrative elements

**Stage 4: Intelligent Curation**
Generated and discovered content is automatically organized based on:
- Narrative relationships and dependencies
- Thematic connections and resonances
- Temporal and spatial relationships
- Visual and aesthetic coherence

**Stage 5: Graceful Surfacing**
Completed media appears through subtle, non-intrusive notifications:
- Gentle visual indicators of new content availability
- Contextual suggestions for related explorations
- Optional preview panels that don't interrupt conversation flow

**Stage 6: One-Click Integration**
Users can effortlessly incorporate generated content:
- Pin interesting media to their active canvas
- Save elements to personal collections
- Commit conversations to permanent timeline entries
- Explore spatial relationships in 3D environments

## UX Flows

### Passive shadow creation
- User converses; text appears; lore agent immediately "knows" it.
- Subtle indicator: "Graph updated in background."
- When processing completes, show gentle toast: "3 entities detected; 1 new to world."

### Active graph exploration
- Open graph view for a conversation: see scene cluster (instances) and entity constellation (upward).
- Toggle: instance-level (scene) vs entity-level (cross-scene) relationships.
- Click an entity → see profile enriched from lore or conversation; provenance viewable.

### Review and formalization
- Select drafts → "Publish to Timeline" → batch commit → webhook populates LanceDB.
- Canon graph becomes finalized; derivatives can be spawned for readers/explorers.

---

## Integrated Lore Chat & Scribe System

### Lore-Scribe Modal Integration
- **Tabbed modal interface**: "Lore" (conversation) and "Scribe" (document editor) tabs in single modal
- **Real-time document creation**: Scribe creates flowing narrative content from lore conversations
- **User-controlled AI assistance**: "Start Scribe" / "Stop Scribe" buttons control background summarization
- **Bidirectional flow**: Documents can launch conversations, conversations create documents
- **Document-as-context**: When resuming conversations, lore agent reads existing text asset for context

### Document Creation & Style
- **Adaptive writing style**: Literary narrative by default, responsive to conversation directives
- **Natural structure**: Flowing article/story format with structured metadata at bottom
- **YAML persistence**: `scribe_enabled` field controls summarizer behavior across sessions
- **Session-based**: Scribe works during active chats only (conversation persistence is future TODO)

### Notifications
- Subtle toasts for: text ingested; entities detected; manifestations ready; relationships consolidated.
- Non-intrusive preview panels; customizable notification levels per user.
- Integrates with existing agent streaming notifications via SSE.

### Review & Curation
- Approve/reject manifestations; edit profiles; batch operations; quality feedback loop feeding validator scores.
- Version history and rollback for timeline entries; diffs for derivative vs canon graph changes.
- Uses existing media asset review patterns and UI components.

### Canvas & Timeline UX
- Canvas auto-organization (by entity clusters or thematic groups) with manual overrides; export options (image/pdf/layout JSON).
- Timeline one-click commit; pre-commit preview with affected graph deltas; post-commit versioning hooks.
- Integrates with existing canvas system (`/api/canvas`) and timeline publishing flow.

---

## Graph as First‑Class Asset & Composition
- Graph assets can be referenced, merged, and composed:
  - Pull: include subgraphs by query (e.g., character arc, theme corridor).
  - Render: project into different views (layout/timeline/space) with distinct strategies.
  - Evolve: relationships strengthen/attenuate based on usage; store evolution history.
  - Compose: “graph-of-graphs” using `CONTAINS` and `REFERENCES` edges between graphs, with inheritance semantics.

---

## Derivative Graphs: Permissions & Conflict Policies
- Permissions:
  - Allowed: add manifestations, create new relationships, adjust weights within ±0.3, add annotations.
  - Not allowed: alter canon TextRoots or canonical entity identities.
- Modification Tracking:
  - `(:Modification {id, type, target_node, data, timestamp, user_action})` nodes linked from `DerivativeGraph`.
  - Diff views for edges/weights vs canon baseline.
- Conflict Resolution:
  - Derivative changes never overwrite canon; merges must be explicitly proposed and reviewed.
  - Weight caps enforced; contradictory relationships flagged for review.

---

## Business Value
### For Creators
- Infinite manifestation from a single text concept; semantic consistency across media; rapid prototyping; discover relationships.

### For Organizations
- Automated asset generation with quality controls; dynamic content evolution; cross-platform rendering; IP preserved via text roots.

### For Knowledge Workers
- Idea visualization across modalities; relationship mapping for complex domains; collaborative sense-making; persistent, explorable artifacts.

---

## System Constraints
- Processing limits: scenes up to ~3k tokens per pass; large works chunked; parallelization bounded by cost/throughput budgets.
- Performance boundaries: smooth 3D viz up to ~5k nodes / ~10k edges per view with clustering; larger graphs require subgraph tiling.
- Quality dependencies: rich descriptive text yields better entity detection/relationships; consistent anchors improve manifestation fidelity.

---

## Risk Assessment & Mitigation

### Technical Risks

**Generation Quality Risk**
- **Risk**: AI-generated content may not meet quality standards
- **Mitigation**: Multi-stage quality checking, user feedback loops, and continuous model improvement
- **Contingency**: Manual review queues and user override capabilities

**Performance Risk**
- **Risk**: Background processing may impact system performance
- **Mitigation**: Careful resource management, priority queuing, and scalable architecture
- **Contingency**: Graceful degradation modes and user-controlled processing limits

**Integration Complexity Risk**
- **Risk**: Complex multi-agent system may be difficult to maintain and debug
- **Mitigation**: Comprehensive logging, modular architecture, and extensive testing
- **Contingency**: Simplified fallback modes and component isolation capabilities

### User Experience Risks

**Overwhelming Content Risk**
- **Risk**: Too much generated content may overwhelm users
- **Mitigation**: Intelligent filtering, user preference learning, and customizable notification levels
- **Contingency**: User-controlled generation limits and easy content dismissal

**Context Misunderstanding Risk**
- **Risk**: System may misinterpret conversation context and generate inappropriate content
- **Mitigation**: Conservative generation thresholds, user feedback integration, and context verification
- **Contingency**: Easy correction mechanisms and learning from user feedback

**Privacy and Control Risk**
- **Risk**: Users may feel uncomfortable with automatic analysis and generation
- **Mitigation**: Transparent operation, user control options, and clear privacy policies
- **Contingency**: Opt-out capabilities and manual-only modes

### Business Risks

**Cost Management Risk**
- **Risk**: Automatic generation may result in high operational costs
- **Mitigation**: Intelligent prioritization, cost monitoring, and efficiency optimization
- **Contingency**: User-based cost limits and premium tier structures

**Content Rights Risk**
- **Risk**: Generated content may raise intellectual property concerns
- **Mitigation**: Clear terms of service, user ownership policies, and content attribution
- **Contingency**: Content licensing frameworks and user agreement updates
## Security & Permissions
- Conversation drafts: private to author/team until formalized.
- Lore vector store uploads: include minimal metadata; content scrubbing per policy.
- Canon graph edits: restricted to maintainers; derivatives open to users under permissions.

---

## Success Metrics and KPIs

### User Engagement Metrics
- **Conversation Depth**: Average length and complexity of lore conversations
- **Flow Maintenance**: Percentage of conversations completed without interruption
- **Content Interaction**: Rate of user engagement with generated content
- **Timeline Commitment**: Percentage of conversations that become timeline entries
- **Shadow Creation Usage**: Percentage of conversations that result in explored graphs
- **Multi-Modal Exploration**: Average number of manifestation types accessed per session
- **Relationship Navigation**: Depth of graph exploration through relationship following

### Content Quality Metrics
- **Generation Relevance**: User approval rate for generated content
- **Content Utilization**: Percentage of generated content that gets used/saved
- **Relationship Accuracy**: Quality of automatically identified content relationships
- **Universe Coherence**: Consistency scores for generated content against existing lore
- **Semantic Consistency Score**: Automated validation of manifestation fidelity to text roots
- **Entity Resolution Accuracy**: % of correct "existing vs new" decisions (validated via review)

### System Performance Metrics
- **Generation Speed**: Average time from conversation to available content
- **Resource Efficiency**: Cost per generated item and overall system resource usage
- **Error Rates**: Frequency of generation failures or inappropriate content
- **Scalability**: System performance under increasing user load
- **Time-to-lore-visibility**: Median seconds from save to vector store availability
- **Graph Rendering Performance**: Time to project graphs into layouts/spaces/timelines

### Business Impact Metrics
- **User Retention**: Impact on user engagement and return rates
- **Content Volume**: Growth in timeline entries and multimedia content
- **User Satisfaction**: Net Promoter Score and user feedback ratings
- **Platform Differentiation**: Unique value proposition strength compared to alternatives
- **Content Multiplication Factor**: Ratio of generated manifestations to source conversations

---

## Implementation Roadmap

### Phase 1: Foundation (Months 1-2)
- Implement integrated lore chat + scribe modal system with tabbed interface
- Create adaptive summarizer with literary narrative style and user control
- Establish bidirectional document-conversation flow with "Continue Conversation" buttons
- Build scribe control system with YAML persistence (`scribe_enabled` field)
- Immediate vector store upload (decouple LanceDB path)
- Entity detection worker with resolution via vector store; Redis caching
- Neo4j schema, constraints, idempotent writers; instance creation within scenes

### Phase 2: Media Generation (Months 3-4)
- Implement image generation pipeline with quality controls
- Add audio generation capabilities
- Create content curation and search integration
- Develop canvas organization and spatial layout features
- Instance-level relationships and batch consolidation into entity-level edges
- Basic graph viewer: scene clusters vs entity constellation; weight threshold filter
- Review UI for ambiguous entities; alias merge operations

### Phase 3: Relationships and Intelligence (Months 5-6)
- Build relationship analysis and mapping systems
- Implement vector space formalization
- Add cross-content connection discovery
- Create advanced search and exploration interfaces
- Batch commit flow; webhook-based formalization; LanceDB sync on formalization
- Performance/cost optimizations; better retry/backoff; monitoring dashboards

### Phase 4: Polish and Scale (Months 7-8)
- Optimize performance and resource usage
- Add collaborative features and multi-user support
- Implement advanced quality assurance systems
- Conduct extensive user testing and refinement
- Analytics-driven reinforcement of entity-level edges only
- Advanced queries (arc detection, thematic corridors)

### Phase 5: Advanced Features (Months 9-12)
- Add video generation and complex media types
- Implement advanced contextual memory systems
- Create 3D spatial exploration environments
- Build analytics and optimization systems
- Expanded provenance and revision history for entity profiles

---

## Technical Challenges & Solutions

### Challenge: Semantic Consistency Across Manifestations
**Solution**: Implement constraint validation system that ensures all manifestations honor text root semantic boundaries while allowing creative interpretation within those bounds.

### Challenge: Relationship Weight Optimization
**Solution**: Use reinforcement learning approach where user interaction patterns strengthen accurate relationships while pruning connections that don't provide value.

### Challenge: Real-Time Generation Coordination
**Solution**: Implement priority queue system with parallel generation workers, allowing high-priority manifestations to complete first while background workers handle exploratory content.

### Challenge: Graph Complexity Management
**Solution**: Use hierarchical graph structures with zoom levels - detailed relationships at micro level, thematic clusters at macro level, with smooth transitions between scales.

### Challenge: Cross-Modal Relationship Discovery
**Solution**: Implement multi-modal embedding system that can find semantic connections between text, images, audio, and video in shared vector space.

---

## Error Handling & Recovery Patterns

### Circuit Breaker Pattern
```typescript
class ServiceCircuitBreaker {
  private failureCount = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  async call(operation: () => Promise<any>) {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
}
```

### Processing Pipeline Error Recovery
- Exponential backoff for transient failures (vector store, Neo4j)
- Partial state recovery from Redis workflow checkpoints
- Job requeuing with failure count tracking
- Graceful degradation: provisional entities when lore oracle unavailable

### Memory Management for Large Graphs
- Node/edge caps per visualization request (5k nodes / 10k edges)
- Subgraph tiling with focus-based loading
- Redis caching of pre-computed clusters
- Background consolidation to prune weak relationships

---

## Deployment Infrastructure

### Docker Configuration
```dockerfile
# Neo4j Database Container
FROM neo4j:5.15-community
ENV NEO4J_AUTH=neo4j/narrative_graphs_password
ENV NEO4J_dbms_memory_heap_max__size=4G
ENV NEO4J_dbms_memory_pagecache_size=1G
RUN wget https://github.com/neo4j/apoc/releases/download/5.15.0/apoc-5.15.0-core.jar \
    -O /var/lib/neo4j/plugins/apoc-5.15.0-core.jar

# API Service Container
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000 3001
CMD ["npm", "start"]
```

### Kubernetes Deployment
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: neo4j
spec:
  replicas: 1
  template:
    spec:
      containers:
      - name: neo4j
        image: narrative-graphs/neo4j:latest
        resources:
          requests: { memory: "6Gi", cpu: "2000m" }
          limits: { memory: "8Gi", cpu: "4000m" }
        volumeMounts:
        - name: neo4j-data
          mountPath: /data
```

---

## Appendices

### A. Relationship Edge Schema (Neo4j properties)
```json
{
  "type": "THEMATIC|CAUSAL|INTERACTS_WITH|SUPPORTS|CONTRASTS|FOLLOWED_BY|INSTANCE_OF|APPEARS_IN",
  "weight": 0.0,
  "confidence": 0.0,
  "evidence_count": 0,
  "discovery_method": "semantic|rule|usage",
  "scene_id": "optional (for instance-level edges)",
  "last_updated": "ISO8601"
}
```

### B. Consolidation Heuristics
- THEMATIC: create/strengthen when ≥ 3 scenes co-mention entities with cosine similarity ≥ threshold; weight ∝ evidence_count, bounded ≤ 1.0.
- CAUSAL: create/strengthen when ≥ 2 scenes contain explicit causal markers between entities; higher base weight, tighter thresholds.

### C. Idempotent Upserts (sketch)
```cypher
// Entity upsert
MERGE (e:Entity { id: $entityId })
ON CREATE SET e.canonId=$canonId, e.canonical_name=$canonicalName, e.type=$type, e.aliases=$aliases, e.profile=$profile, e.provenance=$prov, e.created_at=datetime(), e.updated_at=datetime()
ON MATCH SET e.aliases=$aliases, e.profile=$profile, e.provenance=$prov, e.updated_at=datetime();

// Instance upsert (one per (sceneId, entityId))
MERGE (i:EntityInstance { id: $instanceId })
ON CREATE SET i.sceneId=$sceneId, i.entityId=$entityId, i.textRootId=$textRootId, i.emotional_state=$emo, i.actions=$acts, i.physical_description=$desc, i.created_at=datetime(), i.updated_at=datetime()
ON MATCH SET i.emotional_state=$emo, i.actions=$acts, i.physical_description=$desc, i.updated_at=datetime();

// Instance-level link (within scene)
MERGE (i1)-[r:INTERACTS_WITH { scene: $sceneId, id: $relId }]->(i2)
ON CREATE SET r.weight=$w, r.confidence=$c, r.evidence_count=$n, r.discovery_method=$m, r.last_updated=datetime()
ON MATCH SET r.weight=$w, r.confidence=$c, r.evidence_count=$n, r.discovery_method=$m, r.last_updated=datetime();
```

---

## Conclusion
Narrative Graphs delivers immediate conversational intelligence and bounded, durable narrative structure. It keeps the lore agent perfectly current, reuses our infrastructure, and prevents graph sprawl through a strict entity–instance model with upward-only cross-scene meaning. The system is buildable now with minimal new surface area: a split sync path for text, an entity oracle over the existing vector store, Neo4j with enforced constraints, and a couple of workers driven by our existing SQS/Lambda backbone.

- Immediate value: lore-aware conversations without canonical friction.
- Long-term integrity: clean identity, bounded relationships, scalable graphs.
- Minimal change: reuses storage, queues, search, and agent contracts already in production.



