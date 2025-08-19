# AGENTIC SYSTEM ARCHITECTURE

This document reflects how the system actually works today in code and in production. It’s a concise reference for engineers to understand end‑to‑end flows, ownership of logic, and how to diagnose issues.

## Executive overview

- Backend (planner/executor): Next.js (Node runtime) on AWS ECS Fargate behind ALB
- Frontend (executor/UI): Next.js on Vercel, pure proxy for agent SSE + UI action executor
- Planning: Backend `services/intelligence/SimpleIntentClassifier.ts` with hot‑reloadable planner rules (`config/planner-rules.json`)
- Execution: Backend `services/intelligence/SimpleWorkflowGenerator.ts` streams UI actions; frontend executes and acks
- Save pipeline: UI calls `/api/import/url` → S3 → finish‑upload routes → media JSON store
- Ingestion: AI labeling → enqueue SQS → Generic Ingest Lambda → `ParallelIngestionService` → LanceDB
- Observability: correlation IDs, build fingerprints, health + diagnostic endpoints

## High‑level flow

```mermaid
flowchart LR
  U[User] -->|natural language| VERCEL[/Vercel UI/]
  VERCEL -->|/api/agent (SSE)| AGENT[Agent API @ ECS]
  AGENT -->|plan| CLASSIFIER[SimpleIntentClassifier]
  AGENT -->|emit steps| GENERATOR[SimpleWorkflowGenerator]
  GENERATOR -->|executedSteps (UI actions)| VERCEL
  VERCEL -->|Execute + Ack| AGENT
  VERCEL -->|/api/import/url| SAVE[Finish-Upload Routes]
  SAVE -->|S3 JSON + AI labeling| LABEL[performAiLabeling]
  LABEL -->|enqueueAnalysisJob| SQS[(SQS queue)]
  SQS --> LAMBDA[Generic Ingest Lambda]
  LAMBDA --> PIS[ParallelIngestionService]
  PIS --> LANCEDB[(LanceDB service)]
```

## Request lifecycle (e.g., “make a picture of X and name it Y”)

1. UI posts to `/api/agent` (Vercel). Route is a pure proxy opening an SSE stream from ECS.
2. Backend planner returns `workflow_steps` (e.g., `prepareGenerate → nameImage(name:Y) → saveImage`).
3. Backend executor resolves synonyms/defer rules from `config/ui-map.json`, emits steps as `executedSteps` for the UI.
4. Frontend consumes SSE via `useAgentStream` (`app/workshop/page.tsx`), dispatches to `__agentApi.*` handlers.
5. Handlers follow Execute → Update UI → Ack:
   - `prepareGenerate`: run model, show preview, ack
   - `nameImage`: update title input immediately, stash name, ack
   - `saveImage`: detect media type from URL (image/video), call `/api/import/url`, ack
   - `pinToCanvas`: resolve results and actually pin to the canvas
6. `/api/import/url` uploads to S3, calls finish‑upload; images auto‑trigger AI labeling; after labeling a message is enqueued to SQS for LanceDB ingestion.

## Ownership: where logic lives

- Planning (backend only):
  - `services/intelligence/SimpleIntentClassifier.ts`
  - Config: `config/planner-rules.json` via `RemoteConfig`
- Execution (backend):
  - `services/intelligence/SimpleWorkflowGenerator.ts`
  - Config: `config/ui-map.json` (`toolsToActions`, `backendToolSynonyms`, `deferToFrontend`, `materializationRules`)
- Frontend executor + UI:
  - `app/workshop/page.tsx` (agent stream, `__agentApi` handlers)
  - `/api/agent` (Vercel) is a proxy and event relay only
- Save & finish‑upload:
  - `/api/import/url` → forwards to:
    - Images: `app/api/media-labeling/images/finish-upload/route.ts`
    - Videos: `app/api/media-labeling/videos/finish-upload/route.ts`
    - Audio: `app/api/audio-labeling/finish-upload/route.ts`
- AI labeling + enqueue:
  - `lib/ai-labeling.ts` (sets AI labels, then enqueues ingestion SQS job)
- LanceDB ingestion:
  - Worker: `lambda-generic-ingest/index.js`
  - Library: `lib/ingestion/ParallelIngestionService.ts` (OpenAI embeddings, `/add` or `/bulk-add` → Lance service)

## Hot‑reloadable configuration

- Planner rules (`config/planner-rules.json`): enforce multi‑step patterns and full‑phrase name extraction (e.g., “rocket emoji man”).
- UI map (`config/ui-map.json`):
  - `toolsToActions` — backend tool → frontend action mapping
  - `backendToolSynonyms` — e.g., `nameImage → renameAsset`
  - `deferToFrontend` — always defer `saveImage`; conditionally defer `nameImage`
  - `materializationRules` — prepend `nameImage/saveImage` when a step (like pin) needs a persisted asset
- Loader: `services/config/RemoteConfig.ts` (TTL + ETag). ECS sets `PLANNER_RULES_URL`, `UI_MAP_URL`, `UI_MAP_TTL_SEC`.

## Guardrails and recent fixes

- Single `saveImage` per workflow (duplicate post‑processing removed).
- No auto‑pinning on save; only pin when `payload.pin === true`.
- Media type detection in `saveImage` (image vs video) to avoid `/api/import/url` 500s.
- Backend defers `nameImage`/`saveImage` to UI; UI performs and acks.

## Persistence and ingestion

- Asset JSON + media stored in S3; asset API: `/api/media-labeling/assets/:id`.
- Images: `performAiLabeling` updates labels/status, then enqueues ingestion job.
- Generic ingestion Lambda fetches the asset JSON and calls `ingestAsset(asset, true)` (upsert) → `ParallelIngestionService`.
- `ParallelIngestionService` builds `ContentItem`, generates embeddings (batched, backoff), and posts to LanceDB service (`/add` for single; `/bulk-add` for batches). Uses `LANCEDB_URL | LANCEDB_API_URL`.

## Observability & diagnostics

- Correlation IDs: `corr_<epoch>_<rand>` logged end‑to‑end.
- Build fingerprint: `APP_BUILD_SHA` logged and returned by `/api/health`.
- Endpoints:
  - `/api/health` — ECS health + fingerprint
  - `/api/corr-diagnostic` — verifies planner/executor corr propagation
  - `/api/test-sqs` — supports query params to re‑enqueue a specific asset for Lance ingestion

## Operational playbook

- Verify a save:
  - Browser console: look for `Asset saved via import/url` with S3 URL
  - GET `/api/media-labeling/assets/:id` and confirm `processing_status.ai_labeling=completed`
- Re‑enqueue ingestion to LanceDB:
  - `/api/test-sqs?assetId=<id>&mediaType=image&title=<t>&s3Url=<url>`
- Validate Lance index:
  - Use unified search or Lance stats to confirm record presence

## Deployment notes

- Frontend: push to Git → Vercel deploys (ensure UI execution changes are visible here).
- Backend (ECS):
  - Build Docker with `--platform linux/amd64`
  - ECR image: `781939061434.dkr.ecr.us-east-1.amazonaws.com/hh-agent-app:latest`
  - Ensure the ALB‑attached service is updated; health checks hit `/api/health`
  - Set `PLANNER_RULES_URL`, `UI_MAP_URL`, `UI_MAP_TTL_SEC` env vars
- Queue & ingestion:
  - `SQS_QUEUE_URL` and `AWS_REGION` must be set (Vercel enqueues; Lambda consumes with IAM)

## Key files (jump list)

- Planner: `services/intelligence/SimpleIntentClassifier.ts`
- Executor: `services/intelligence/SimpleWorkflowGenerator.ts`
- Remote config: `services/config/RemoteConfig.ts`
- UI workshop: `app/workshop/page.tsx`
- Import route: `app/api/import/url/route.ts`
- Finish‑uploads:
  - `app/api/media-labeling/images/finish-upload/route.ts`
  - `app/api/media-labeling/videos/finish-upload/route.ts`
  - `app/api/audio-labeling/finish-upload/route.ts`
- Asset API: `app/api/media-labeling/assets/[id]/route.ts`
- Ingestion worker: `lambda-generic-ingest/index.js`
- Ingestion lib: `lib/ingestion/ParallelIngestionService.ts`

## Known pitfalls

- Mismatched container platform (ARM image on x86 task) → always build with `--platform linux/amd64`.
- Updating the wrong ECS service (ALB points to a different service) → verify target groups.
- Planner config not loaded (missing env vars) → backend falls back; confirm logs include planner version.
- Video saved as image (import 500s) → ensure media type detection in `saveImage` is active.

---

For incidents, capture: correlation ID, `/api/health` build SHA, planner/ui‑map versions from logs, and whether SQS enqueue succeeded. That’s enough to trace the full waterfall quickly.
