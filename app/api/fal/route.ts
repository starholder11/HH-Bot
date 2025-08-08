import { NextRequest, NextResponse } from 'next/server'
import { fal } from '@fal-ai/client'

// Simple FAL proxy endpoint
// POST body: { model: string, input?: any, subscribe?: boolean }
// If subscribe=true, attaches queue updates in the response JSON (non-streaming for now)

export async function POST(req: NextRequest) {
  try {
    const apiKey = (process.env.FAL_KEY || '').trim()
    if (!apiKey) {
      return NextResponse.json({ error: 'FAL_KEY not set' }, { status: 500 })
    }

    // Configure client per request to ensure fresh env
    fal.config({ credentials: apiKey })

    const { model, input = {}, subscribe = false } = await req.json()
    if (!model || typeof model !== 'string') {
      return NextResponse.json({ error: 'model is required' }, { status: 400 })
    }

    // Prefer subscribe to handle long-running jobs; fall back to run
    try {
      if (subscribe !== false) {
        const result = await fal.subscribe(model, {
          input,
          logs: true,
          onQueueUpdate: () => {},
        } as any)
        return NextResponse.json({ success: true, result })
      }
    } catch (subErr: any) {
      console.warn('[api/fal] subscribe failed, falling back to run:', subErr?.message || subErr)
    }

    const result = await fal.run(model, { input } as any)
    return NextResponse.json({ success: true, result })
  } catch (err: any) {
    console.error('[api/fal] error:', err)
    return NextResponse.json({ error: err?.message || 'Unknown error' }, { status: 500 })
  }
}


