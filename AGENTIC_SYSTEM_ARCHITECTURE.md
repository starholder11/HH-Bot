# AGENTIC SYSTEM ARCHITECTURE

This is the authoritative reference for how the agentic system actually works in this codebase today. It explains end‑to‑end data flow, ownership, configuration, streaming, tool registration, persistence, ingestion, deployments, and how to debug it when it misbehaves.

If you read nothing else, read “Generalized Executor Contract”, “Streaming Lifecycle”, and “Troubleshooting Playbook”.

---

## 1) Roles and Responsibilities

- Backend (planner/executor): Next.js (Node runtime) on AWS ECS Fargate behind ALB.
  - Plans workflows from natural language.
  - Emits a stream of UI actions (steps) to be executed by the browser.
  - Executes backend‑only tools when available; defers UI tools to browser.
- Frontend (executor/UI): Next.js on Vercel.
  - Pure proxy for `/api/agent` (SSE stream) and `/api/agent/ack`.
  - Browser runs the “executor loop” that performs the tool actions, updates UI, persists to APIs, then ACKs.
- Persistence: `/api/import/url` + finish‑upload routes save assets to S3 and JSON stores.
- Ingestion: AI labeling + SQS → Generic Ingest Lambda → `ParallelIngestionService` → LanceDB.

---

## 2) Generalized Executor Contract (Backend plans, Browser executes)

The contract between planner and UI is explicit and universal:

- Backend outputs a strictly ordered list of tool actions ("steps") describing what the UI must do.
- Browser’s job is to:
  1) Execute the action (call appropriate UI code and/or backend API),
  2) Update the UI state so the user sees it,
  3) Send an ACK to `/api/agent/ack` with any artifacts/ids produced.
- The backend treats ACKs as completion signals for each step. If a later step depends on the prior one, the dependency is the ACK + any emitted artifact ID.

This is implemented in:
- Backend: `services/intelligence/SimpleWorkflowGenerator.ts` (emits `executedSteps`)
- Frontend: `app/workshop/page.tsx` (stream consumer + `__agentApi`)

---

## 3) Streaming Lifecycle (SSE)

- Client calls the Vercel route `/api/agent` which is a pure proxy to the ECS agent endpoint. The response is an SSE stream.
- The browser processes SSE events using a hook (`useAgentStream`). Each event is a “tool action” object with fields like:
  - `action`: canonical UI action name (e.g., `prepareGenerate`, `nameImage`, `saveImage`, `pinToCanvas`)
  - `payload`: parameters for the action (prompt, name, items, correlationId, etc.)
- For each incoming action, the browser dispatches to `__agentApi[action](payload)`.
- After the handler finishes the real work, it POSTS to `/api/agent/ack` with:
  - `correlationId`, `step` (lowercase tool name), and `artifacts` (any produced asset ids/urls).

Important:
- The stream can contain both backend‑executed steps (emitted as results) and frontend‑deferred steps (that the browser must execute). The UI executes only what it receives as UI actions.

---

## 4) Redis Context and Workflow State

File: `services/context/RedisContextService.ts`

What we store:
- User context (`context:<tenantId>:<userId>`)
  - `activeProjects`, `recentSearches` (capped), `canvasItems`, `preferences`, `sessionHistory` (capped), `lastActivity`
  - TTL ≈ 24h
- Workflow state (`workflow:<executionId>`)
  - `executionId`, `tenantId`, `userId`, `correlationId`, `workflowType`, `status`, `currentStep`, `context`, `results`, `errors[]`, timestamps
  - TTL ≈ 7 days

Key behaviors:
- `generateCorrelationId()` → `corr_<epoch>_<random8>` used across logs and events.
- `getUserContext` auto‑creates defaults if not present, updates `lastActivity` and persists with TTL.
- `recordSessionEvent(...)` appends to session history (capped) and persists.
- `createWorkflowState(...)` produces an id `workflow_<epoch>_<rand>` and stores an initial record.
- `getUserActiveWorkflows(...)` scans keys and returns running/pending states (bounded by TTL).

Runtime config:
- Uses `REDIS_AGENTIC_URL` or `REDIS_URL`. When missing, the service constructs a throwing proxy so any accidental usage fails loudly at call time (not at import time).

---

## 5) Planning (Backend‑only)

File: `services/intelligence/SimpleIntentClassifier.ts`

- Produces structured `workflow_steps` from user text.
- Loads `config/planner-rules.json` via `RemoteConfig` (ETag + TTL) to keep planner hot‑reloadable.
- Rules enforce compound actions: e.g., “make X and name it Y” → `prepareGenerate → nameImage(name:Y) → saveImage`.
- Name extraction is full‑phrase, not last‑word only (e.g., “rocket emoji man”).
- Post‑processing that used to insert duplicates has been removed. The planner is authoritative; it generates exactly one `saveImage` when required.

---

## 6) Behavior Mapping (Backend↔UI)

File: `config/ui-map.json`

- `toolsToActions`: maps backend tool names to UI action names.
- `backendToolSynonyms`: synonym mapping for missing or aliased tool names (e.g., `nameImage → renameAsset` with parameter transforms).
- `deferToFrontend`: rules instructing executor to defer a backend tool to the UI (e.g., always defer `saveImage`; defer `nameImage` if there is no `assetId`). Deferred steps are emitted into the stream instead of being executed on the server.
- `materializationRules`: prepend steps needed to “materialize” content (e.g., if `pinToCanvas` requires a persisted asset and none exists yet, prepend `nameImage` and `saveImage`).

Loader:
- `services/config/RemoteConfig.ts` handles fetch + schema validation with ETag, TTL caching.
- ECS environment: `UI_MAP_URL`, `UI_MAP_TTL_SEC` (and similarly for planner rules).

---

## 7) Tool Registry (What “tools” exist and how they enter the system)

We support three sources of tools and expose them through registries:

A) Core tools (handwritten, low‑level, general):
- File: `services/tools/CoreTools.ts`
- Examples: `searchUnified`, `createCanvas`, `pinToCanvas`, `prepareGenerate`, etc.

B) Comprehensive tools (hand‑crafted composites):
- File: `services/tools/ComprehensiveTools.ts`
- Curated higher‑level operations with stricter schemas.

C) Generated API tools (discovered from API routes):
- Files: `services/tools/ToolFactory.ts` (scanner/generator)
- Scans `app/api/**/route.ts` to synthesize Zod schemas and execution wrappers.

Registries:
- `services/tools/UniversalToolRegistry.ts`
  - Registers CoreTools, ComprehensiveTools, and Generated tools.
  - Normalizes differences in client semantics (CoreTools expects Axios‑like `{ data, status }`; generator uses fetch directly).
  - Exposes `getAISDKTools()` so planner/executor can plug them into AI SDK tooling shape.
- `services/tools/ToolRegistry.ts` (legacy/comprehensive registry used in older routes) — still present; Universal is the broader registry used by planner/executor paths.

How tools map into execution:
- Planner outputs step names aligned with registry/tool names (or synonyms from `ui-map.json`).
- Executor resolves the intended tool name:
  1) If a backend tool exists → execute on server and emit the result.
  2) If tool is marked “deferToFrontend” (by rule or because no backend implementation exists) → emit a UI action event into the SSE stream instead.

---

## 8) Browser Executor (How the browser “picks up tasks”)

File: `app/workshop/page.tsx`

- `useAgentStream` attaches to the SSE stream from `/api/agent` and yields action objects.
- We map the action to a handler on `__agentApi` (e.g., `__agentApi.saveImage(payload)`).
- Each handler must follow the generalized contract:
  - Execute the real work:
    - `prepareGenerate`: run the model, place preview
    - `nameImage`: set the title input field immediately and cache the name
    - `saveImage`: detect media type (image/video) from URL and call `/api/import/url`
    - `pinToCanvas`: resolve items and actually pin to canvas
  - Update the UI state (so user sees the effect immediately)
  - Send an ACK: POST `/api/agent/ack` with `correlationId`, `step`, and produced `artifacts`

Important guardrails implemented:
- No auto‑pinning on save; only pin when `payload.pin === true`.
- Media type detection: .mp4/“video”/service‑specific cues → `mediaType: 'video'` else `'image'` when calling `/api/import/url`.

---

## 9) Save Pipeline and AI Labeling

- Entry point: `app/api/import/url/route.ts`:
  - Downloads remote `url` → uploads to S3 using `lib/s3-upload.ts`.
  - Forwards to finish‑upload routes by media type:
    - Images: `app/api/media-labeling/images/finish-upload/route.ts`
    - Videos: `app/api/media-labeling/videos/finish-upload/route.ts`
    - Audio: `app/api/audio-labeling/finish-upload/route.ts`
- Finish‑upload routes write asset JSON, derive metadata, and trigger follow‑ups:
  - Images call `performAiLabeling(assetId)`.
  - Videos enqueue analysis and also fire the Lambda API directly as a safety net.
  - Audio attempts immediate Lance ingestion, then falls back to enqueue on error.

---

## 10) LanceDB Ingestion Pipeline

- Enqueue: `lib/queue.ts` (requires `SQS_QUEUE_URL`, `AWS_REGION`).
- Worker: `lambda-generic-ingest/index.js`
  - Fetches asset JSON (or S3 JSON for keyframes) and calls `ingestAsset(asset, true)` (upsert).
- Library: `lib/ingestion/ParallelIngestionService.ts`
  - Transforms asset → `ContentItem` with combined text (AI labels, manual labels, prompts, etc.).
  - Generates OpenAI embeddings (batched with backoff and rate limiting), averages across chunks as needed.
  - Sends to Lance via `/add` for singles or `/bulk-add` for batches.
  - Uses `LANCEDB_URL | LANCEDB_API_URL` to find the Lance service.

Manual re‑enqueue for a specific asset:
- GET `/api/test-sqs?assetId=<id>&mediaType=<image|video|audio>&title=<t>&s3Url=<url>`
  - Useful when the ingestion job didn’t fire or you’re re‑hydrating a single record.

---

## 11) Observability & Diagnostics

- Correlation IDs: `corr_<epoch>_<rand>` logged end‑to‑end (planner, executor, UI handlers).
- Build fingerprint: `APP_BUILD_SHA` included in logs and `/api/health` response.
- Endpoints:
  - `/api/health` — health + build SHA (ECS health target)
  - `/api/corr-diagnostic` — force a tiny plan/exec path, returns routeCorr vs generatorCorr + build sha
  - `/api/test-sqs` — interactive enqueue with query params to validate the SQS path

---

## 12) Deployment Notes (and Foot‑guns to avoid)

- Frontend: push to Git → Vercel deploys. Any change to browser executor or `/api/import/url` appears here.
- Backend (ECS):
  - Build Docker with `--platform linux/amd64`.
  - Image: `781939061434.dkr.ecr.us-east-1.amazonaws.com/hh-agent-app:latest`.
  - Ensure the ALB‑attached service is updated; health checks hit `/api/health`.
  - Environment vars: `PLANNER_RULES_URL`, `UI_MAP_URL`, `UI_MAP_TTL_SEC` (and `APP_BUILD_SHA`).
- Queue & ingestion:
  - `SQS_QUEUE_URL` and `AWS_REGION` must be set (Vercel enqueues; Lambda consumes with IAM).

Common pitfalls and fixes:
- Platform mismatch (ARM image on x86 ECS) → always build with `--platform linux/amd64`.
- Updating the wrong ECS service → verify ALB target groups and service names.
- Duplicate `saveImage` → planner post‑processing was removed; backend must output exactly one.
- Video saved as image (import 500s) → ensure media type detection in `saveImage` is active.

---

## 13) Troubleshooting Playbook

When an action “does nothing” or UI stalls:
1) Check the browser console for action logs (we log every handler start/finish).
2) Confirm `/api/agent/ack` was sent (look for “✅ <step> ack sent”).
3) Check ECS logs with the correlation ID to see if the backend received the ACK.
4) If save failed, inspect the `/api/import/url` response code and body; ensure mediaType detection is correct.

When asset is saved but not searchable:
1) GET `/api/media-labeling/assets/:id` and verify `processing_status.ai_labeling === 'completed'`.
2) Re‑enqueue Lance ingestion with `/api/test-sqs?assetId=...`.
3) Check Generic Ingest Lambda logs; look for `/add` success in Lance service logs.

When planner does the wrong thing:
1) Confirm ECS has `PLANNER_RULES_URL` set; backend logs should print the planner version.
2) Inspect `config/planner-rules.json` for the exact example that should cover your case.

---

## 14) Interfaces and Jump List

- Planner: `services/intelligence/SimpleIntentClassifier.ts`
- Executor: `services/intelligence/SimpleWorkflowGenerator.ts`
- Remote config: `services/config/RemoteConfig.ts`
- Redis context: `services/context/RedisContextService.ts`
- Universal registry: `services/tools/UniversalToolRegistry.ts`
- Core tools: `services/tools/CoreTools.ts`
- Comprehensive tools: `services/tools/ComprehensiveTools.ts`
- API tool generator: `services/tools/ToolFactory.ts`
- UI workshop: `app/workshop/page.tsx`
- Import route: `app/api/import/url/route.ts`
- Finish‑uploads:
  - `app/api/media-labeling/images/finish-upload/route.ts`
  - `app/api/media-labeling/videos/finish-upload/route.ts`
  - `app/api/audio-labeling/finish-upload/route.ts`
- Asset API: `app/api/media-labeling/assets/[id]/route.ts`
- Ingestion worker: `lambda-generic-ingest/index.js`
- Ingestion lib: `lib/ingestion/ParallelIngestionService.ts`

---

## 15) FAQ (Concrete behaviors)

- Q: Who names and saves generated assets?
  - A: Backend plans the steps; UI performs `nameImage` (updates field) and `saveImage` (calls `/api/import/url`), then ACKs.
- Q: Can the UI short‑circuit planning and do its own thing?
  - A: No. Browser executes only what is streamed. All multi‑step logic originates in the backend planner.
- Q: How are tools added?
  - A: Implement in Core/Comprehensive, or provide an API route that ToolFactory can turn into a generated tool; register via UniversalToolRegistry; map UI behavior via `config/ui-map.json` if it’s a UI action.
- Q: Why do some steps say “deferred: true”?
  - A: They’re emitted to the UI because they are UI‑owned actions (rename/save/pin/etc.).

---

This document is kept intentionally explicit. If code diverges, fix the code or update this document the same day. The browser is the executor; the backend is the planner and coordinator. Keep the contract tight and the logs loud.
