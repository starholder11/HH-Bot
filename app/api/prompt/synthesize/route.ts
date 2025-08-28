import { NextRequest, NextResponse } from 'next/server';
import { getOpenAIClient } from '@/lib/ai-labeling';

export async function POST(req: NextRequest) {
  try {
    const { context, request } = await req.json();
    if (typeof request !== 'string' || request.trim().length === 0) {
      return NextResponse.json({ error: 'Missing request' }, { status: 400 });
    }

    const openai = getOpenAIClient();

    const promptText = `You are a prompt planner that converts conversational lore/context into a concise, vivid visual generation prompt.

CONTEXT (may be partial):
"""
${String(context || '').slice(-1200)}
"""

USER REQUEST:
${request}

TASK:
- If the user is asking to create/make/generate/draw/paint/render a picture/image/photo/portrait/video, synthesize a single, self-contained prompt that includes:
  - character: age, gender (if implied), distinguishing physical features, clothing, expression
  - setting: location, environment, time of day, atmosphere
  - mood/style: tone, color/mood, any artistic style if implied
  - tie vague references like "him/her/they/that person" to the described entity in CONTEXT
- If there is not enough information for any element, infer tasteful defaults consistent with the context rather than leaving it blank.
- Output ONLY the final prompt with no preface or explanation.
`;

    const resp: any = await (openai as any).responses.create({
      input: [{ role: 'user', content: promptText }],
      max_output_tokens: 512,
      stream: false,
      store: false,
    });

    let text = '';
    try {
      if ((resp as any).output_text) {
        text = (resp as any).output_text as string;
      } else if (Array.isArray(resp?.output) && resp.output[0]?.content) {
        const arr = resp.output[0].content;
        for (const item of arr) {
          if (item.type === 'text') text += item.text;
        }
      }
    } catch {}

    text = (text || '').trim();
    if (!text) {
      // Fallback: just echo request
      text = String(request).trim();
    }

    return NextResponse.json({ prompt: text });
  } catch (error) {
    console.error('prompt/synthesize error', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}


