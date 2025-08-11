import { NextRequest } from 'next/server';
import { streamText, tool } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';

// Comprehensive UI Control Tools
const tools = {
  searchUnified: tool({
    description: 'Search and display content in Results section - use for ANY content request (images, videos, audio, "show me", "find", "pull up")',
    parameters: z.object({
      query: z.string(),
    }),
    execute: async ({ query }) => {
      try {
        const baseUrl = process.env.PUBLIC_API_BASE_URL || `http://localhost:3000`;
        const url = `${baseUrl}/api/unified-search?q=${encodeURIComponent(query)}&limit=100`;
        const res = await fetch(url, { method: 'GET' });
        if (!res.ok) throw new Error(`Unified search failed: ${res.status}`);
        const json = await res.json();
        if (!json.success) {
          return `Search unavailable: ${json.error || 'Unknown error'}. Try again later.`;
        }
        return { action: 'showResults', payload: json };
      } catch (error) {
        return `Search temporarily unavailable. ${error instanceof Error ? error.message : 'Please try again later.'}`;
      }
    }
  }),
  
  pinToCanvas: tool({
    description: 'Pin selected content to canvas for reference or generation',
    parameters: z.object({
      contentId: z.string(),
      type: z.string(),
      url: z.string(),
      title: z.string().optional(),
    }),
    execute: async ({ contentId, type, url, title }) => {
      return { 
        action: 'pinToCanvas', 
        payload: { contentId, type, url, title: title || 'Pinned Content' }
      };
    }
  }),

  prepareGenerate: tool({
    description: 'Set up media generation with parameters. Call this for any "make/create" requests.',
    parameters: z.object({
      userRequest: z.string().describe('The full user request text to analyze'),
      type: z.enum(['image', 'video', 'audio']).optional().describe('Media type if known'),
      prompt: z.string().optional().describe('Generation prompt if specified'),
      model: z.string().optional(),
      refs: z.array(z.string()).optional(),
    }),
    execute: async ({ userRequest, type, prompt, model, refs }) => {
      // Smart extraction from user request
      const request = userRequest.toLowerCase();
      
      // Detect media type from request
      let finalType = type;
      if (!finalType) {
        if (/\b(video|movie|clip|animation)\b/i.test(request)) {
          finalType = 'video';
        } else if (/\b(audio|song|track|music|sound)\b/i.test(request)) {
          finalType = 'audio';
        } else {
          finalType = 'image';
        }
      }
      
      // Extract prompt from request
      let finalPrompt = prompt;
      if (!finalPrompt) {
        // Try to extract descriptive content after media type
        const patterns = [
          // "make video of X" or "make a video of X"
          /(?:make|create|generate|produce|build|design|craft)\s+(?:a|an|some)?\s*(?:video|movie|clip|animation)\s+(?:of|about|with|showing)?\s*(.+)/i,
          // "make audio of X" or "make a song of X"  
          /(?:make|create|generate|produce|build|design|craft)\s+(?:a|an|some)?\s*(?:audio|song|track|music|sound)\s+(?:of|about|with|featuring)?\s*(.+)/i,
          // "make image of X" or "make a picture of X"
          /(?:make|create|generate|produce|build|design|craft)\s+(?:a|an|some)?\s*(?:picture|image|photo)\s+(?:of|about|with|showing)?\s*(.+)/i,
          // Generic fallback - anything after make/create
          /(?:make|create|generate|produce|build|design|craft)\s+(.+)/i
        ];
        
        for (const pattern of patterns) {
          const match = userRequest.match(pattern);
          if (match && match[1]) {
            const extracted = match[1].trim();
            // Skip if it's just the media type
            if (!['video', 'audio', 'image', 'picture', 'photo', 'song', 'track', 'music', 'movie', 'clip'].includes(extracted.toLowerCase())) {
              finalPrompt = extracted;
              break;
            }
          }
        }
        
        if (!finalPrompt) {
          finalPrompt = 'Creative content';
        }
      }
      
      return { 
        action: 'prepareGenerate', 
        payload: { 
          type: finalType, 
          prompt: finalPrompt, 
          model: model || 'default', 
          refs: refs || [],
          originalRequest: userRequest
        }
      };
    }
  }),

  agentStatus: tool({
    description: 'Get current generation status and running processes',
    parameters: z.object({}),
    execute: async () => {
      try {
        const res = await fetch(`${process.env.PUBLIC_API_BASE_URL || ''}/api/agent/status` || '/api/agent/status', { method: 'GET' });
        if (!res.ok) throw new Error('Status fetch failed');
        const status = await res.json();
        return { action: 'agentStatus', payload: status };
      } catch (error) {
        return { action: 'agentStatus', payload: { status: 'idle', error: error instanceof Error ? error.message : String(error) } };
      }
    }
  }),

  chat: tool({
    description: 'Handle greetings and general conversation',
    parameters: z.object({
      message: z.string(),
    }),
    execute: async ({ message }) => {
      // Simple greeting responses that will be displayed as normal text
      const greetings = ["Hey! Ready to help you find content or create something awesome!", "Hello! What can I help you discover today?", "Hi there! Looking for some media or want to generate something?"];
      const response = greetings[Math.floor(Math.random() * greetings.length)];
      return response; // Return plain string for normal chat display
    }
  }),

  showOutput: tool({
    description: 'Display generation output in Output section',
    parameters: z.object({
      content: z.string(),
      type: z.string(),
      metadata: z.object({}).optional(),
    }),
    execute: async ({ content, type, metadata }) => {
      return { 
        action: 'showOutput', 
        payload: { content, type, metadata: metadata || {} }
      };
    }
  }),

  openCanvas: tool({
    description: 'Open the canvas interface for planning generation',
    parameters: z.object({
      mode: z.string().optional(),
    }),
    execute: async ({ mode }) => {
      return { 
        action: 'openCanvas', 
        payload: { mode: mode || 'default' }
      };
    }
  }),

  nameImage: tool({
    description: 'Set name/title for generated images',
    parameters: z.object({
      imageId: z.string().optional(),
      name: z.string().optional(),
    }),
    execute: async ({ imageId, name }) => {
      return { 
        action: 'nameImage', 
        payload: { imageId: imageId || 'current', name: name || 'Untitled' }
      };
    }
  }),

  saveImage: tool({
    description: 'Save image to library/collection',
    parameters: z.object({
      imageId: z.string().optional(),
      collection: z.string().optional(),
      metadata: z.object({}).optional(),
    }),
    execute: async ({ imageId, collection, metadata }) => {
      return { 
        action: 'saveImage', 
        payload: { imageId: imageId || 'current', collection: collection || 'default', metadata: metadata || {} }
      };
    }
  }),

  useCanvasLora: tool({
    description: 'Apply LoRA model to canvas generation',
    parameters: z.object({
      loraName: z.string(),
      strength: z.number().optional(),
      trigger: z.string().optional(),
    }),
    execute: async ({ loraName, strength, trigger }) => {
      return { 
        action: 'useCanvasLora', 
        payload: { loraName, strength: strength || 1.0, trigger: trigger || '' }
      };
    }
  }),

};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Updated: Working agent with proper tool calling

export async function POST(req: NextRequest) {
  const { messages } = await req.json();

  // Server-side intent routing to guarantee correct tool usage
  const lastUserMessage = Array.isArray(messages)
    ? [...messages].reverse().find((m: any) => m?.role === 'user')?.content ?? ''
    : '';
  const lastText = typeof lastUserMessage === 'string' ? lastUserMessage : '';
  const searchIntentRegex = /\b(search|find|show|pull\s*up|dig\s*up|pics?|pictures?|images?|photos?|media|video|audio|look.*up|gimme|give me)\b/i;
  const greetingIntentRegex = /\b(hi|hello|hey|yo|sup|what's up|wassup)\b/i;
  const generateIntentRegex = /\b(make|create|generate|produce|build|design|craft)\s+(a|an|some)?\s*(picture|image|photo|video|audio|song|track|music)\b/i;
  const videoGenerateRegex = /\b(make|create|generate|produce|build|design|craft)\s+(a|an|some)?\s*(video|movie|clip|animation)\b/i;
  const audioGenerateRegex = /\b(make|create|generate|produce|build|design|craft)\s+(a|an|some)?\s*(audio|song|track|music|sound)\b/i;
  const pinIntentRegex = /\b(pin|save|bookmark|attach)\s+.*(to|on)\s+(the\s+)?(canvas|board)\b/i;
  const openCanvasIntentRegex = /\b(open|show|display)\s+(the\s+)?(canvas|board|generation\s+interface)\b/i;
  const nameImageIntentRegex = /\b(name|title|call|label)\s+(this\s+)?(image|picture|photo)\b/i;
  const saveImageIntentRegex = /\b(save|store|keep)\s+(this\s+)?(image|picture|photo)\s*(to\s+)?(library|collection|gallery)?\b/i;
  const useLoraIntentRegex = /\b(use|apply|add)\s+(the\s+)?(lora|model)\b/i;

  // Hard guarantee: for specific intents, force appropriate tools (order matters - most specific first)
  const forcedToolChoice: any = openCanvasIntentRegex.test(lastText)
    ? { type: 'tool', toolName: 'openCanvas' }
    : nameImageIntentRegex.test(lastText)
      ? { type: 'tool', toolName: 'nameImage' }
      : saveImageIntentRegex.test(lastText)
        ? { type: 'tool', toolName: 'saveImage' }
        : useLoraIntentRegex.test(lastText)
          ? { type: 'tool', toolName: 'useCanvasLora' }
          : generateIntentRegex.test(lastText)
            ? { type: 'tool', toolName: 'prepareGenerate' }
            : pinIntentRegex.test(lastText)
              ? { type: 'tool', toolName: 'pinToCanvas' }
              : searchIntentRegex.test(lastText)
                ? { type: 'tool', toolName: 'searchUnified' }
                : greetingIntentRegex.test(lastText)
                  ? { type: 'tool', toolName: 'chat' }
                  : 'auto';

  const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY! });

  const result = await streamText({
    // Cast to any to avoid versioned type conflicts between subpackages during CI type check
    model: openai('gpt-4o-mini') as any,
    system:
      'You are a tool-calling agent. Call exactly ONE tool and stop. ' +
      'For generation requests (make/create X): call prepareGenerate with userRequest parameter containing the full user message. ' +
      'For search requests: call searchUnified with the query. ' +
      'For canvas operations: call openCanvas, pinToCanvas, nameImage, saveImage, or useCanvasLora as appropriate. ' +
      'For greetings: call chat tool. ' +
      'For status: call agentStatus. ' +
      'ALWAYS pass the full user message as userRequest parameter when calling prepareGenerate. ' +
      'NEVER call multiple tools. NEVER give text responses after tool calls.',
    messages,
    tools,
    toolChoice: forcedToolChoice,
    maxSteps: 1,
  });

  return result.toDataStreamResponse();
}


