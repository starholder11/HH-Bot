## NARRATIVE_GRAPHS_TEXT_SYSTEM
### Product Spec: Text Assets via Layouts, Git-backed Storage, and OAI Sync

---

## Executive Summary
This spec defines the end-to-end flow for treating authored text as first-class, Git-backed assets managed inside Layouts (not Keystatic-only), with immediate ingestion into the lore vector store (OpenAI File Search) while retaining the existing Git webhook → OAI ingestion path. It cleanly separates inline layout text (headers/footers/UI copy) from durable “Text Assets” intended for timeline publication and lore, and introduces a user-initiated background document mode in chat that summarizes conversation into a living draft text asset editable in the Layout editor.

---

## Goals and Non‑Negotiables
- Distinguish layout inline text from durable text assets.
- Author and manage text assets inside Layouts using the existing rich text editor modal.
- Store text assets identically to Keystatic’s timeline model (YAML + MDX in `content/timeline/<slug>/`).
- Commit to Git (preserving the current publication model), without replacing the existing webhook → OAI vectorization path.
- Add an immediate secondary OAI File Search sync on create/update so lore agent sees drafts instantly.
- Add an agentic “background document” mode: user-initiated summarization of an active chat into a draft text asset.
- Allow users to open and edit the background document in the Layout editor via an agent command.
- All authored content for text assets must be Markdown (MDX-compatible) and exported as Markdown; no raw HTML.

---

## Scope (Phase 1: Text Assets Foundation)
In scope now:
- Data model extension in Layouts to classify text as `layout_inline` vs `asset`.
- Rich Text Editor Modal changes to select text kind and (when asset) capture minimal metadata.
- API/service to create/update Git-backed text assets (YAML + MDX) under `content/timeline/*`.
- Immediate OAI File Search upload on save (secondary ingest), in addition to existing Git webhook path.
- Agent commands to create text assets and to start/stop a background document for a conversation.
- Command to open the asset in the Layout editor for live editing.

Out of scope now (later phases):
- Graph/entity extraction and relationships (covered in core Narrative Graphs spec).
- Canvas/manifestation automation.
- Neo4j storage and queries.

---

## Terminology
- Layout Inline Text: Ephemeral text embedded in a layout (headers, footers, notes). Not a text asset.
- Text Asset: Durable doc intended for timeline/lore; Git-backed (YAML+MDX); synced to OAI file search.
- Background Document: A living draft text asset auto-summarized from a chat when explicitly enabled by the user.

---

## Data Model

### Layout Text Kind
- Add `textKind` to layout text nodes:
  - `layout_inline` (default): current behavior; not stored as an asset; excluded from OAI sync.
  - `asset`: treated as a text asset with file-backed storage and OAI sync.

### Text Asset Metadata (YAML front-matter parity with Keystatic)
- Directory: `content/timeline/<slug>/`
- Files:
  - `index.yaml` (metadata)
  - `content.mdx` (body)

Minimal `index.yaml` fields (align to Keystatic):
```yaml
slug: <string>
title: <string>
date: <ISO8601>
categories: [<string>, ...]
source: conversation|layout|import
status: draft|committed
```

Notes:
- `source` distinguishes origin: conversation (agent), layout (manual), import (migration).
- `status` controls publication state; `draft` assets still sync to OAI (secondary path) but do not affect LanceDB until Git commit webhook runs (unchanged behavior).

---

## User Flows

### 1) Create/Edit Text Asset in Layouts
1. User opens Layout editor and adds/edits a text block.
2. Rich Text Editor Modal shows a new control:
   - Text Kind: [Layout Inline | Text Asset]
3. If “Text Asset” is selected, additional fields appear:
   - Title (required)
   - Slug (auto-suggested from Title; editable)
   - Categories (optional)
4. User saves.
5. System writes/updates `content/timeline/<slug>/index.yaml` and `content/timeline/<slug>/content.mdx` in the repo and commits.
6. Immediately after write, system uploads the MDX body (and minimal metadata) to OAI File Search for instant lore visibility (secondary path).
7. The existing Git webhook → OAI ingestion continues to run when the commit lands.

Edge behavior:
- Switching from `layout_inline` to `asset` prompts for required metadata and creates files.
- Switching from `asset` to `layout_inline` stops further asset updates but does not delete prior files; user can manually remove or archive.

### 2) Create Text Asset via Chat Agent (One-shot)
1. User: “Create a text asset titled ‘Withered Grove’ with this body: …”
2. Agent validates metadata, writes YAML+MDX, commits to Git.
3. Agent invokes immediate OAI File Search upload for the MDX body.
4. Agent replies with a link/button to open the asset in the Layout editor.

### 3) Start/Stop Background Document from Chat (User-initiated)
1. User: “Start a background doc titled ‘Almond Al – Conversation Summary’.”
2. Agent creates a draft text asset (YAML+MDX) with status `draft` and registers a background summarizer.
3. As the chat proceeds, a second lore-agent periodically updates the MDX (summary transformation) and bumps metadata timestamps.
4. Each update triggers an immediate OAI File Search upload (secondary path) so the lore agent stays current.
5. User can “Stop background doc” at any time; asset remains editable and can be committed.

### 4) Open Asset for Editing from Chat
1. User: “Open the background doc in the layout editor.”
2. Agent emits a command to the client to open the Layout editor with the asset’s rich text modal focused on the text block linked to `<slug>`.
3. Edits save back to YAML+MDX and retrigger immediate OAI upload.

---

## UI/UX Changes (Layouts)

### Rich Text Editor Modal
- New field: “Text Kind”
  - Radio/select: `Layout Inline` (default), `Text Asset`.
- When `Text Asset`:
  - Show Title, Slug, Categories.
  - Show status indicator (Draft/Committed) read-only; editable via commit action.
  - Show “Sync to Lore Now” action (manual re-upload to OAI; also auto on save).

### Inline/Asset Visual Cues
- Inline text: subtle “Inline” tag.
- Asset text: “Asset” tag with linked slug; click navigates to asset file view.

---

## Markdown & Formatting Requirements

### General Rules (Applies Everywhere)
- All text asset bodies are written and stored as Markdown (MDX-compatible). Front matter remains in `index.yaml`, not in `content.mdx`.
- Disallowed: raw HTML, `<script>`, `<style>`, iframes. Escape angle brackets. Only whitelisted MDX components (if any) may be allowed later.
- Allowed Markdown primitives:
  - Headings `#`–`####` (H1–H4)
  - Paragraphs and line breaks
  - Emphasis/strong: `*italic*`, `**bold**`
  - Lists: `-` unordered, `1.` ordered; nested lists allowed (≤ 2 levels recommended)
  - Code: inline `` `code` `` and fenced blocks ``` ```
  - Blockquotes: `>` for quotes
  - Links: `[text](https://example.com)` with absolute or safe relative paths
  - Images: `![alt](url)`; alt text required; remote URLs must be safe
  - Horizontal rules: `---`
  - Tables: pipe syntax (keep simple; header row + 1–10 rows)
- MDX specifics: do not import components inside `content.mdx`. If MDX shortcodes are introduced later, they must be explicitly whitelisted.
- Validation: run Markdown/MDX parse on save; reject on invalid constructs; show user-friendly errors.

### Rich Text Editor (Layouts) Markdown Mapping
- The RTE operates in “Markdown mode” for `textKind=asset` and guarantees Markdown export.
- Toolbar → Markdown tokens:
  - Bold → `**text**`; Italic → `*text*`
  - H1/H2/H3/H4 → `#`, `##`, `###`, `####`
  - Bulleted list → `- `; Numbered list → `1. `
  - Quote → `>`; Code → inline `` `code` `` or fenced ``` ``` for blocks
  - Link → `[label](url)`; Image → `![alt](url)` (alt required)
  - Table → pipe table; enforce header + body rows
- Pasting: sanitize to Markdown, stripping unsupported HTML; preserve allowed semantics.
- Preview: side-by-side Markdown preview uses the same renderer as publication to reduce surprises.
- Linting: optional markdownlint rules (line length soft cap, trailing spaces, fenced code language hints when possible).

### Background Summarizer Formatting
- The summarizer produces Markdown only; no HTML or non-whitelisted MDX.
- Document structure is stable and idempotent:
  - Title (H1)
  - Sections (H2/H3) for Synopsis, Beats, Entities, Settings, Themes, References
  - Bulleted lists for beats and entities; blockquotes for notable lines of dialogue
  - Optional fenced code blocks for pseudo-structures (e.g., JSON snippets) when needed
- Updates modify sections in place; avoid duplicating headings; preserve anchors.
- Links/images: only when explicitly derived from safe, known assets; otherwise plain text.
- Size & readability: prefer short paragraphs; use lists where suitable; keep lines reasonably short.

---

## Rich Text Editor Audit (Current State) and Remediation

Findings (from `app/workshop/components/Layout/LayoutEditorStandalone.tsx` and `app/visual-search/components/Layout/LayoutEditorStandalone.tsx`):
- Layout items persist HTML in `inlineContent.html` and block `config.content` for `blockType` such as `hero`, `cta`, `footer`, `text_section`.
- Helpers `getRichTextHtmlForItem` and `applyRichTextHtmlToItem` read/write raw HTML and derive plain-text fallbacks via DOM parsing.
- Result: current behavior emits/stores HTML, which is incompatible with Markdown-only text assets.

Policy:
- `layout_inline`: may continue storing HTML; not synced to OAI; not a text asset.
- `asset` (`textKind=asset`): must produce and store Markdown; HTML disallowed.

Remediation:
- Editor mode gate: when `textKind=asset`, enable Markdown mode (toolbar → Markdown tokens) and disable HTML paths.
- Conversion: when switching an existing HTML block to asset mode, run HTML→Markdown conversion with a whitelist (e.g., Turndown), show a diff preview, then apply on confirm.
- Storage: for asset mode, store Markdown in `config.content_markdown` (or `inlineContent.markdown`); never use `config.content`/`inlineContent.html`.
- Rendering: render Markdown for preview using the same renderer as publication.
- Validation: block save if HTML is detected; sanitize pasted content to Markdown in asset mode.

---

## Storage and Git Workflow

### File Structure
- `content/timeline/<slug>/index.yaml`
- `content/timeline/<slug>/content.mdx`

### Save Semantics
- Write files atomically; create directory if missing.
- Commit message conventions:
  - Create: `feat(text): create <slug> via layouts`
  - Update: `chore(text): update <slug> via layouts`

### Status and Publication
- `status: draft` by default.
- Publication via existing commit + webhook flow remains unchanged for LanceDB and downstream indices.

---

## OAI File Search Sync (Secondary Ingest)

Purpose: ensure the lore agent has immediate visibility of draft and evolving text assets without waiting for Git webhook ingestion.

Behavior:
- On create/update of `content.mdx`, upload to the configured vector store (e.g., `vs_6860128217f08191bacd30e1475d8566`).
- Upsert by deterministic `external_id` = `timeline:<slug>`; replace or mark superseded versions.
- Include minimal metadata: `{ slug, title, source, updatedAt }`.
- Retries with exponential backoff; failures recorded; no user-blocking.

Idempotency:
- Hash MDX body; skip upload if unchanged.
- Cache last known hash in Redis: `textAsset:lastHash:<slug>`.

### Detailed Upsert Design

Objectives:
- Mirror the Git-webhook-based ingestion semantics, but trigger from the app on each create/update to keep lore immediately current.

Inputs:
- Slug, Title, Source, Status, Categories (from `index.yaml`)
- MDX body (from `content.mdx`)
- Optional correlationId (from agent/message flow)

Transform:
- Strip disallowed HTML (already enforced by editor); keep pure Markdown/MDX text.
- Normalize whitespace, ensure trailing newline.

Identity & Versioning:
- external_id: `timeline:<slug>` (stable per asset)
- content_hash: SHA-256 of MDX body
- Store mapping `{ slug -> file_id, last_content_hash }` in Redis: `oaiFile:timeline:<slug>`
- On upsert:
  - If `last_content_hash === new_hash`: no-op
  - Else: call OAI File Search upsert; update Redis mapping

Metadata Mapping (sent alongside file where supported):
- `{ slug, title, source, categories, status, updatedAt, correlationId? }`

Chunking Policy:
- Prefer single-file upload letting OAI handle chunking. If provider limits require manual chunking, use 8–16k character chunks with overlap 150–300 chars and attach `chunkIndex` in metadata.

API Contract (pseudo):
```http
POST /internal/oai/upsert-file
{
  "externalId": "timeline:<slug>",
  "metadata": { "slug": "<slug>", "title": "<title>", "source": "layout|conversation|import", "categories": [..], "status": "draft|committed", "updatedAt": "ISO8601", "correlationId": "..." },
  "content": "<mdx>"
}

// Response
{ "fileId": "file_abc", "externalId": "timeline:<slug>", "hash": "<sha256>", "stored": true }
```

Client/Service Pseudocode:
```ts
const key = `oaiFile:timeline:${slug}`;
const last = await redis.get(key); // { fileId?, hash? }
const hash = sha256(mdx);
if (last?.hash === hash) return { skipped: true };

const res = await upsertToOAI({ externalId, metadata, content: mdx });
await redis.set(key, { fileId: res.fileId, hash }, TTL_30d);
```

Error Handling & Retries:
- 429/5xx: exponential backoff (jittered) up to 24h
- Validation failures: log + surface toast in UI; provide “Retry” and “Download MDX” debug tools
- Partial outages: queue to `oai_upsert_dlq` with replay job

Rate Limits & Backpressure:
- Debounce rapid updates per slug (e.g., ≥ 5s)
- Global concurrency cap (e.g., 5–10) with queueing

Observability:
- Log fields: `externalId`, `fileId`, `hash`, `status`, `latencyMs`, `retries`, `corrId`
- Metrics: success rate, p95 latency, skipped-noop count, DLQ depth

Security:
- Scrub metadata, ensure access controls; redact private content if workspace marked private (configurable)

---

## Batch Commit & Push Safeguards

Problem: avoid uncommitted `content/timeline/*` changes when developers push backend changes, preventing asset loss.

Strategy:
- Server-side batching of content writes and an enforced pre-push guard.

1) Server Batch Commits
- On any asset write, append `{ slug, path, hash, ts }` to Redis list `textAssets:pending` and stage files on disk.
- A batcher runs every 60s (configurable) or when pending count ≥ N (e.g., 10):
  - Stages all `content/timeline/*` changes
  - Single commit: `chore(text): batch commit <k> assets`
  - Optional: auto-push if running in managed environment; otherwise noop
- Crash safety: files are written atomically before acknowledgment; if commit fails, batcher retries; nothing is lost.

2) Developer Pre-Push Guard
- Install a Git `pre-push` hook (via `scripts/bootstrap-env.ts`) that runs:
  - `node scripts/flush-text-asset-commits.ts`
  - This script: stages `content/timeline/*` changes, commits with `chore(text): flush pending text assets`, and exits non-zero if commit fails (blocking push).
- Optional environment flag to disable locally.

3) CI Safeguard (belt-and-suspenders)
- CI job verifies that the working tree is clean under `content/timeline/*` after checkout + generation. If dirty, fail the build with guidance to run the flush script locally and repush.

4) Manual Flush Action
- UI button “Commit Text Assets Now” calls an internal endpoint to trigger immediate batch commit from the server.

Operational Notes:
- Commit frequency is configurable; default 60s window.
- Commit author uses a bot identity (e.g., `text-bot <bot@starholder>`), annotated with correlation IDs in commit message when available.

Failure Modes & Recovery:
- Git lock/contention: retry with jitter; if persistent, enqueue DLQ and surface alert.
- Merge conflicts on concurrent edits: prefer last-writer-wins for MDX body; emit a conflict ticket for manual review if both YAML and MDX changed.
- Network/push failures: keep local commits; retry background push.

---

## Agent Commands and APIs

### Chat Intents
- “create text asset <title> …” → create YAML+MDX, commit, OAI upload, return slug and open-action.
- “start background doc <title/slug?>” → create draft asset, enable summarizer, OAI upload on each update.
- “stop background doc” → halt summarizer.
- “open doc <slug> in layout editor” → client command to open editor focused on asset text.

### HTTP Endpoints (internal)
- POST `/api/text-assets` → create/update asset from payload.
- POST `/api/text-assets/:slug/sync-oai` → force re-sync to OAI.
- GET `/api/text-assets/:slug` → fetch YAML+MDX.
- POST `/api/chat/background-doc/start` → start summarizer for `conversationId` + `slug|title`.
- POST `/api/chat/background-doc/stop` → stop summarizer.
- POST `/api/layouts/open-text-asset` → client bridge to open editor for `slug`.

### Payload Sketches
```jsonc
// Create/Update Text Asset
POST /api/text-assets
{
  "slug": "withered-grove",
  "title": "Withered Grove",
  "categories": ["starholder", "lore"],
  "source": "layout",
  "status": "draft",
  "mdx": "# Withered Grove\n..."
}

// Start Background Doc
POST /api/chat/background-doc/start
{
  "conversationId": "conv_123",
  "slug": "almond-al-summary",
  "title": "Almond Al – Conversation Summary"
}

// Layout Open Command (agent → client)
POST /api/layouts/open-text-asset
{
  "slug": "almond-al-summary",
  "editorMode": "text"
}
```

---

## Background Document Summarizer

Triggering:
- Only when the user explicitly starts it from chat.

Operation:
- Periodically summarize new chat turns into an evolving MDX document.
- Preserve a stable heading structure; append/change sections idempotently.
- On each update: write MDX, update timestamps, commit to Git (optional “autosave without commit” mode if preferred), upload to OAI.

Controls:
- Rate limits to avoid thrash (e.g., min 30s between updates).
- Size caps per write (chunk if long).
- Stop on command or on conversation inactivity TTL.

Observability:
- Emit progress events to `processing:{slug}` channel.
- Store state in Redis: `narrativeGraphs.draftTextDocs` with `{ docId/slug, status, lastUpdateAt }`.

---

## Redis Context Additions
```json
{
  "narrativeGraphs": {
    "draftTextDocs": [
      { "slug": "almond-al-summary", "title": "Almond Al – Conversation Summary", "status": "draft", "source": "conversation", "lastUpdateAt": "ISO8601" }
    ],
    "backgroundDocs": [
      { "conversationId": "conv_123", "slug": "almond-al-summary", "enabled": true, "lastRun": "ISO8601" }
    ]
  }
}
```

---

## Security & Permissions
- Only authorized users can create/commit text assets.
- Draft assets remain private until committed.
- OAI upload includes minimal metadata; follow scrubbing policies.

---

## Error Handling & Idempotency
- File writes are idempotent by `slug`; safe to retry.
- OAI sync uses external IDs and content hashes; retries with backoff.
- Background summarizer recovers from last saved MDX; skips duplicate writes.

---

## Migration and Backward Compatibility
- Default `textKind` = `layout_inline` for all existing layout text blocks.
- No changes to existing Keystatic flows; both systems write to the same `content/timeline/` structure.
- Existing Git webhook → OAI path remains intact.

---

## Milestones

### M1: Asset Basics in Layouts
- Add `textKind` to layout text nodes and UI.
- Write YAML+MDX to `content/timeline/<slug>/`.
- Git commit pipeline.

### M2: Secondary OAI Sync
- On-save OAI upload with idempotency.
- Admin tool to force re-sync.

### M3: Chat Agent Integrations
- Commands: create asset, start/stop background doc, open in editor.
- Background summarizer writing to MDX + OAI sync.

### M4: Polish
- Better UX affordances (status indicators, error toasts).
- Telemetry/analytics.

---

## QA Checklist
- Creating a text asset from Layouts produces correct YAML+MDX, commits to Git.
- Toggling `layout_inline` ↔ `asset` behaves as specified.
- Immediate OAI sync fires on create/update; idempotent on no-op changes.
- Chat “create asset” writes files and opens in editor.
- Background doc starts only on explicit user command, updates persist, OAI syncs, stop works.
- Opening in editor from chat focuses correct asset.

---

## Open Questions
- Should background doc autosaves commit to Git each time or batch commits? (Default: commit on explicit publish; allow configurable autosave commits.)
- Do we gate OAI sync for private workspaces or always upload with limited metadata? (Default: sync drafts; respect privacy flags.)
- Slug collision policy: auto-increment vs prompt user?

---

## Appendix: Example Files

`content/timeline/withered-grove/index.yaml`
```yaml
slug: withered-grove
title: Withered Grove
date: 2025-01-01T00:00:00.000Z
categories: [starholder, lore]
source: layout
status: draft
```

`content/timeline/withered-grove/content.mdx`
```mdx
# Withered Grove

Almond Al stood in the drought-stricken grove, tracing the bark and weighing scarcity against the memory of abundance.
```



---

## Ordered Implementation Task List

1) Add textKind to layout items and UI toggle
- Add `textKind` to layout text nodes; default `layout_inline`.
- RTE modal: toggle `Layout Inline` vs `Text Asset`.
- Acceptance: existing layouts unaffected; toggle persists; backward compatibility maintained.

2) Implement Markdown-only RTE mode for text assets
- Toolbar → Markdown tokens; paste sanitizer; side-by-side preview.
- Validation: reject residual HTML; enforce allowed Markdown.
- UI affordance: add “Sync to Lore Now” action that triggers OAI upsert.
- Acceptance: exporting asset text yields valid Markdown per spec; manual sync works.

3) Remediate current RTE HTML paths for asset mode
- For asset mode, store `config.content_markdown` (or `inlineContent.markdown`); never write HTML fields.
- Add HTML→Markdown converter for mode switch with diff/confirm.
- Acceptance: switching an HTML block to asset mode produces clean Markdown and blocks save on invalid constructs.

4) Text asset file writer (YAML + MDX) and commit
- API to write `content/timeline/<slug>/index.yaml` + `content.mdx`; atomic write; commit messages per convention.
- Slug generation and collision policy; idempotent updates.
- Endpoint: `POST /api/text-assets` for create/update; `GET /api/text-assets/:slug` to fetch.
- Acceptance: files created/updated correctly; Git history shows expected commits; endpoints function with auth.

5) Immediate OAI File Search upsert service
- Implement externalId `timeline:<slug>`, content hash, Redis cache, retries, observability.
- Debounce per-slug updates; include minimal metadata.
- Endpoint: `POST /internal/oai/upsert-file` and `POST /api/text-assets/:slug/sync-oai` (manual re-sync).
- Config: bind vector store id/keys via env; secrets management.
- Redis keys: `oaiFile:timeline:<slug>` for `{ fileId, hash }`.
- Acceptance: on save, OAI upsert occurs; no-op when unchanged; metrics/logs populated; manual re-sync works.

6) Batch commit & push safeguards
- Server batcher (interval and threshold) for pending text asset commits.
- Developer `pre-push` hook to flush pending `content/timeline/*` changes.
- CI check that tree is clean under `content/timeline/*`.
- Endpoint: admin “Commit Text Assets Now” trigger to flush batch.
- Acceptance: cannot push with uncommitted text assets; batch commits appear regularly.

7) Chat agent: create/open asset flows
- Commands: create asset (write + commit + OAI), open asset in layout editor.
- Endpoint: `POST /api/layouts/open-text-asset` to focus editor; integrate client command.
- Acceptance: one-shot creation works end-to-end with OAI sync and editor open.

8) Background document pipeline
- Start/stop commands; summarizer loop; sectioned Markdown output; rate limits; Redis state.
- Each update triggers OAI upsert; optional autosave commit config.
- Endpoints: `POST /api/chat/background-doc/start` and `/stop`.
- Redis keys: `narrativeGraphs.draftTextDocs`, `backgroundDocs`.
- Acceptance: background doc evolves with chat; edits visible; syncs immediately to OAI; start/stop works.

9) Permissions and privacy controls
- Enforce authoring rights; private-workspace handling for OAI metadata.
- Acceptance: unauthorized actions blocked; private data policies respected.

10) QA and telemetry
- Implement tests for Markdown validation, file writer, OAI upsert idempotency, batcher, and chat flows.
- Dashboards for upsert latency/success and batch commit cadence.
- Acceptance: all checks green; dashboards show healthy signals.

