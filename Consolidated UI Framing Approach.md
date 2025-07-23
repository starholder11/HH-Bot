# Consolidated UI Framing Approach

## Goal
Create a single “File Manager” interface that lets admins work with **images, videos, and audio** while leaving every existing admin UI untouched and fully functional.

## Guiding Principles
1. **Zero regression** – Originals under `/media-labeling`, `/video-analysis`, and `/audio-labeling` keep working exactly as before.
2. **Three new routes only** –
   * `/file-manager`   (consolidated UI)
   * `/video-editor`   (minimal video‐only player)
   * `/audio-editor`   (minimal audio‐only player)
3. **Shared components, no forked logic** – Each new page imports the same React components/hooks used by the originals so fixes & enhancements propagate automatically.
4. **No backend/API changes** – All calls hit the existing endpoints.
5. **Styling last** – Visual tweaks come **after** functionality is proven.

## Page Map
| Route | Purpose | Source Page Copied From | What Gets Stripped |
|-------|---------|-------------------------|--------------------|
| /media-labeling | Original image workflow | – (unchanged) | – |
| /video-analysis | Original video workflow | – (unchanged) | – |
| /audio-labeling | Original audio workflow | – (unchanged) | – |
| **/file-manager** | Consolidated asset list & viewer | media-labeling | none (acts as host) |
| **/video-editor** | Video-only viewer inside iframe | video-analysis | header, side list, filter bar, settings drawer |
| **/audio-editor** | Audio-only viewer inside iframe | audio-labeling | header, project card, side list |

## Execution Phases

### Phase 0 – Safety Check
0.1 Ensure repo is at checkpoint commit `c8bb919` (done).
0.2 `npm run dev` → manually smoke-test the three original pages.

### Phase 1 – Duplicate Pages (no refactor yet)
1.1 `cp app/media-labeling/page.tsx app/file-manager/page.tsx`
1.2 `cp app/video-analysis/page.tsx app/video-editor/page.tsx`
1.3 `cp app/audio-labeling/page.tsx app/audio-editor/page.tsx`

### Phase 2 – Prune the Editor Copies
• **video-editor** – delete everything except the central asset div (video player, keyframe timeline, status banner & basic controls).
• **audio-editor** – delete everything except the waveform + metadata panel & controls.

### Phase 3 – Wire Up File-Manager
1. Keep image workflow exactly as in media-labeling.
2. Replace its central asset viewer with:
   ```tsx
   if (asset.type === 'image') return <ImageViewer … />;
   if (asset.type === 'video') return (
     <iframe src={`/video-editor?asset=${asset.id}`} className="h-full w-full" />
   );
   if (asset.type === 'audio') return (
     <iframe src={`/audio-editor?song=${asset.id}`} className="h-full w-full" />
   );
   ```
3. Inside each editor page, read the querystring (`searchParams`) to load the correct asset.

### Phase 4 – QA
• Smoke-test every asset type inside `/file-manager`.
• Regression-test the three original pages.
• Verify iframe sizing & scrolling.

### Phase 5 – Styling Pass (Optional)
After functional sign-off, adjust spacing, typography, and responsive breakpoints **only in the new pages** or shared Tailwind classes.

## Component & Logic Sharing
All heavy logic lives in imported components (`VideoAnalysisControls`, `UploadModal`, hooks, API utilities, etc.). The new pages only wrap those components in simpler layouts, so there is **no duplication of business logic** and bug fixes flow to both the originals and the editors.

## Risks & Mitigations
| Risk | Mitigation |
|------|------------|
| Editor copies drift from originals | Keep logic in shared components; only thin wrappers are duplicated |
| Iframe sizing / focus quirks | Fixed-height container + `allow="fullscreen"`; manual cross-browser test |
| Route collision | All new pages use unique paths; originals untouched |
| Deployment rollback | Feature isolated to one commit; `git revert` cleanly removes it |

## Rollback Plan
Because the consolidation lives **entirely in three new files**, reverting is as simple as deleting those files and removing any route links, or running:
```bash
git revert <consolidation-commit-sha>
```

## Audio Upload Placement (new consideration)
* **Short-term** – when trimming `audio-editor`, move the existing “+ Upload” button / `UploadModal` **inside the main asset panel** that remains.  The upload flow is self-contained, so relocating the trigger does not affect APIs, S3 keys, or song refresh logic.  The only change is visual positioning.
* **Long-term** – once `/file-manager` is live, wire that same `UploadModal` (or its underlying `useAudioUpload` hook) into the unified uploader UI alongside image & video uploads so everything shares a common experience.

_No additional technical risk beyond cosmetics; see analysis in chat  for rationale._

---
**Next Action:** follow *Phase 0* to verify the clean baseline, then proceed with Phase 1 when ready.
