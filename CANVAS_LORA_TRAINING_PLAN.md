# CANVAS LoRA Training and Usage (FAL FLUX)

## References
- FAL FLUX LoRA Fast Training: https://fal.ai/models/fal-ai/flux-lora-fast-training

## Goals
- Train a LoRA per canvas from its images using FAL’s FLUX trainer.
- Use that LoRA in Visual-Search generation (chat and Generate tab).

## Data Model (Canvas JSON Extension)
Add `loras` array to canvas JSON:

```
loras: [
  {
    provider: 'fal',
    family: 'flux',
    baseModel: 'fal-ai/flux.1-dev',
    triggerWord: 'CANVAS_STYLE',
    artifactUrl?: string,           // set when training completes
    version: 1,
    status: 'training'|'completed'|'failed',
    images: number,
    requestId: string,
    createdAt: string,
    updatedAt: string
  }
]
```

## Backend
- POST `/api/canvas/train-lora`
  - Input: `{ canvasId: string, baseModel?: string, triggerWord?: string }`
  - Reads canvas by id; collects up to 20 image URLs
  - Zips images, uploads to S3
  - Calls `fal-ai/flux-lora-fast-training` with `{ images_data_url, trigger_word, is_style: true }`
  - Writes a new LoRA entry to the canvas (`status: 'training'`, `requestId`)

- GET `/api/canvas/train-status?requestId=...&canvasId=...`
  - Checks FAL queue status
  - When completed, fetches result; updates matching LoRA entry with `artifactUrl` and `status: 'completed'`

- POST `/api/generate` (existing) – update to accept `options.loras` and, if present for image mode, route to a FLUX LoRA-capable model and pass `input.loras = [{ path, scale }]`.

## UI
- Canvas tab: “Train LoRA” button and status display (poll `/api/canvas/train-status`).
- Generate tab: LoRA selector dropdown. Selecting a LoRA switches model to a FLUX-compatible generation and includes the LoRA in the request.

## Notes
- LoRAs are model-family specific. We’ll default to FLUX (flux.1-dev) for training and generation.
- Minimum 3 images required to start training.


