import { NextResponse } from 'next/server'

// Curated FAL models with lightweight input schemas for dynamic UI
// This can later be fetched from a remote registry if FAL exposes one.

type JSONSchema = {
  type: 'object'
  required?: string[]
  properties: Record<string, any>
}

type FalModel = {
  id: string
  name: string
  provider: 'fal'
  category: 'image' | 'audio' | 'video' | 'text'
  description: string
  inputSchema: JSONSchema
  defaults?: Record<string, any>
}

const MODELS: FalModel[] = [
  {
    id: 'fal-ai/fast-sdxl',
    name: 'Fast SDXL (Image)',
    provider: 'fal',
    category: 'image',
    description: 'Fast Stable Diffusion XL for quick text-to-image results',
    inputSchema: {
      type: 'object',
      required: ['prompt'],
      properties: {
        prompt: { type: 'string', title: 'Prompt' },
        negative_prompt: { type: 'string', title: 'Negative Prompt' },
        width: { type: 'number', title: 'Width', minimum: 256, maximum: 1536, default: 1024 },
        height: { type: 'number', title: 'Height', minimum: 256, maximum: 1536, default: 1024 },
        guidance_scale: { type: 'number', title: 'Guidance', minimum: 0, maximum: 20, default: 7 },
        steps: { type: 'number', title: 'Steps', minimum: 1, maximum: 50, default: 25 },
        seed: { type: 'number', title: 'Seed' },
      },
    },
    defaults: { width: 1024, height: 1024, guidance_scale: 7, steps: 25 },
  },
  {
    id: 'fal-ai/flux/dev',
    name: 'FLUX Dev (Image)',
    provider: 'fal',
    category: 'image',
    description: 'FLUX dev model for high quality images',
    inputSchema: {
      type: 'object',
      required: ['prompt'],
      properties: {
        prompt: { type: 'string', title: 'Prompt' },
        width: { type: 'number', title: 'Width', default: 1024 },
        height: { type: 'number', title: 'Height', default: 1024 },
        steps: { type: 'number', title: 'Steps', default: 28 },
        seed: { type: 'number', title: 'Seed' },
      },
    },
    defaults: { width: 1024, height: 1024, steps: 28 },
  },
  {
    id: 'fal-ai/flux/schnell',
    name: 'FLUX Schnell (Image, Fast)',
    provider: 'fal',
    category: 'image',
    description: 'Ultra-fast FLUX variant for drafts and iterations',
    inputSchema: {
      type: 'object',
      required: ['prompt'],
      properties: {
        prompt: { type: 'string', title: 'Prompt' },
        width: { type: 'number', title: 'Width', default: 1024 },
        height: { type: 'number', title: 'Height', default: 1024 },
        steps: { type: 'number', title: 'Steps', default: 8 },
        seed: { type: 'number', title: 'Seed' },
      },
    },
    defaults: { width: 1024, height: 1024, steps: 8 },
  },
  {
    id: 'fal-ai/image-to-video',
    name: 'Image to Video',
    provider: 'fal',
    category: 'video',
    description: 'Turn a single image into a short video',
    inputSchema: {
      type: 'object',
      required: ['prompt'],
      properties: {
        prompt: { type: 'string', title: 'Prompt / Description' },
        duration: { type: 'number', title: 'Duration (s)', default: 4 },
      },
    },
    defaults: { duration: 4 },
  },
  {
    id: 'fal-ai/tts',
    name: 'Text to Speech',
    provider: 'fal',
    category: 'audio',
    description: 'Generate speech audio from text',
    inputSchema: {
      type: 'object',
      required: ['prompt'],
      properties: {
        prompt: { type: 'string', title: 'Text' },
        voice: { type: 'string', title: 'Voice', enum: ['alloy', 'verse', 'vibrant', 'warm'] },
        format: { type: 'string', title: 'Format', enum: ['mp3', 'wav'], default: 'mp3' },
      },
    },
    defaults: { voice: 'alloy', format: 'mp3' },
  },
  {
    id: 'fal-ai/llama-3.1',
    name: 'Llama 3.1 (Text)',
    provider: 'fal',
    category: 'text',
    description: 'General-purpose LLM for text generation',
    inputSchema: {
      type: 'object',
      required: ['prompt'],
      properties: {
        prompt: { type: 'string', title: 'Prompt' },
        max_tokens: { type: 'number', title: 'Max Tokens', default: 512 },
        temperature: { type: 'number', title: 'Temperature', default: 0.7, minimum: 0, maximum: 2 },
      },
    },
    defaults: { max_tokens: 512, temperature: 0.7 },
  },
]

export async function GET() {
  return NextResponse.json({ models: MODELS })
}


