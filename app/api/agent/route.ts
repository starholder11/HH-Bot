import { NextRequest, NextResponse } from 'next/server';
import { streamText, tool } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';

// Comprehensive UI Control Tools
const tools = {
  searchUnified: tool({
    description: 'Search and display content in Results section - use for ANY content request (images, videos, audio, "show me", "find", "pull up"). Automatically detects media type requests.',
    parameters: z.object({
      query: z.string(),
      requestedMediaType: z.enum(['image', 'video', 'audio', 'text', 'media', 'all']).optional().describe('Override media type if detected from query'),
    }),
    execute: async ({ query, requestedMediaType }) => {
      try {
        // Smart media type detection from query
        let detectedType = requestedMediaType;

        if (!detectedType) {
          const queryLower = query.toLowerCase();

          // Media type detection patterns
          if (/\b(video|videos|movie|movies|clip|clips|film|films|footage|animation|animations)\b/.test(queryLower)) {
            detectedType = 'video';
          } else if (/\b(image|images|picture|pictures|photo|photos|pic|pics|artwork|artworks|visual|visuals)\b/.test(queryLower)) {
            detectedType = 'image';
          } else if (/\b(audio|song|songs|music|track|tracks|sound|sounds|vocal|vocals|recording|recordings)\b/.test(queryLower)) {
            detectedType = 'audio';
          } else if (/\b(text|document|documents|article|articles|post|posts|writing|writings|story|stories)\b/.test(queryLower)) {
            detectedType = 'text';
          } else if (/\b(media|content|file|files|asset|assets)\b/.test(queryLower)) {
            detectedType = 'media'; // All media types (image, video, audio)
          }
          // If no specific type detected, search all content
        }

        const baseUrl = process.env.PUBLIC_API_BASE_URL || `http://localhost:3000`;
        let url = `${baseUrl}/api/unified-search?q=${encodeURIComponent(query)}&limit=100`;

        // Add type filter if detected
        if (detectedType && detectedType !== 'all') {
          url += `&type=${encodeURIComponent(detectedType)}`;
        }

        const res = await fetch(url, { method: 'GET' });
        if (!res.ok) throw new Error(`Unified search failed: ${res.status}`);
        const json = await res.json();
        if (!json.success) {
          return `Search unavailable: ${json.error || 'Unknown error'}. Try again later.`;
        }

        // Add filter info to the response for user feedback
        if (detectedType && detectedType !== 'all') {
          json.appliedFilter = detectedType;
        }

        return { action: 'showResults', payload: json };
      } catch (error) {
        return `Search temporarily unavailable. ${error instanceof Error ? error.message : 'Please try again later.'}`;
      }
    }
  }),

  pinToCanvas: tool({
    description: 'Pin content to canvas. Provide contentId from search results or specify content to pin.',
    parameters: z.object({
      contentId: z.string().describe('ID of content to pin (e.g. "2068-odyssey")'),
      type: z.string().optional().describe('Content type if known (image/video/audio)'),
      url: z.string().optional().describe('Content URL if known'),
      title: z.string().optional().describe('Content title/name'),
      userRequest: z.string().optional().describe('Original user request for context'),
    }),
    execute: async ({ contentId, type, url, title, userRequest }) => {
      // Smart defaults and content lookup
      let finalType = type || 'image'; // Default to image
      let finalUrl = url || ''; // Will be resolved by UI
      let finalTitle = title || contentId; // Use contentId as fallback title

      // Try to infer type from contentId or request
      if (!type && contentId) {
        const id = contentId.toLowerCase();
        if (id.includes('video') || id.includes('movie') || id.includes('clip')) {
          finalType = 'video';
        } else if (id.includes('audio') || id.includes('song') || id.includes('music')) {
          finalType = 'audio';
        }
      }

      return {
        action: 'pinToCanvas',
        payload: {
          id: contentId, // UI bridge expects 'id' not 'contentId'
          contentId, // Keep for backward compatibility
          type: finalType,
          url: finalUrl,
          title: finalTitle,
          needsLookup: !url, // Signal to UI that it needs to resolve URL
          originalRequest: userRequest
        }
      };
    }
  }),

  prepareGenerate: tool({
    description: 'Set up media generation with parameters. Call this for ANY generation request including "make", "create", "generate", "use X to make Y", etc.',
    parameters: z.object({
      userRequest: z.string().describe('The full user request text to analyze'),
      type: z.enum(['image', 'video', 'audio']).optional().describe('Media type if known'),
      prompt: z.string().optional().describe('Generation prompt if specified'),
      model: z.string().optional(),
      refs: z.array(z.string()).optional(),
      loraNames: z.array(z.string()).optional().describe('Names of LoRA models to use (e.g. ["petaflop sheen", "commissarsha"])'),
    }),
    execute: async ({ userRequest, type, prompt, model, refs, loraNames }) => {
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

      // Extract LoRA names and prompt from request
      let finalLoraNames = loraNames || [];
      let finalPrompt = prompt;

      if (!finalLoraNames.length || !finalPrompt) {
        // Enhanced patterns for LoRA + generation requests
        const loraGeneratePatterns = [
          // "use X lora to make Y" or "use the X lora to make Y"
          /(?:use|apply)\s+(?:the\s+)?(.*?)\s+(?:lora|model|style)\s+(?:to\s+)?(?:make|create|generate|build|produce)\s+(.+)/i,
          // "make Y using the X lora" - match from the END to avoid greedy matching
          /(?:make|create|generate|build|produce)\s+(.+)\s+(?:using|with)\s+(?:the\s+)?(.*?)\s+(?:lora|model|style)$/i,
          // "X lora Y" - simple pattern (keep as fallback)
          /(.*?)\s+(?:lora|style)\s+(.+)/i
        ];

        for (let i = 0; i < loraGeneratePatterns.length; i++) {
          const pattern = loraGeneratePatterns[i];
          const match = userRequest.match(pattern);
          if (match) {
            if (i === 0) {
              // Pattern: "use X lora to make Y"
              if (match[1] && match[2]) {
                finalLoraNames = [match[1].trim()];
                finalPrompt = match[2].trim();
                break;
              }
            } else if (i === 1) {
              // Pattern: "make Y using X lora"
              if (match[1] && match[2]) {
                finalPrompt = match[1].trim();
                finalLoraNames = [match[2].trim()];
                break;
              }
            } else {
              // Pattern: "X lora Y" (fallback)
              if (match[1] && match[2]) {
                finalLoraNames = [match[1].trim()];
                finalPrompt = match[2].trim();
                break;
              }
            }
          }
        }

        // Fallback: extract standard generation patterns
        if (!finalPrompt) {
          const standardPatterns = [
            // "make/create X"
            /(?:make|create|generate|produce|build|design|craft)\s+(?:a|an|some)?\s*(.+)/i,
            // Any descriptive content
            /(.+)/i
          ];

          for (const pattern of standardPatterns) {
            const match = userRequest.match(pattern);
            if (match && match[1]) {
              const extracted = match[1].trim();
              // Clean up common prefixes
              finalPrompt = extracted
                .replace(/^(?:a|an|some)\s+/i, '')
                .replace(/^(?:picture|image|photo|video|audio|song|track|music|movie|clip)\s+(?:of|about|with|showing|featuring)?\s*/i, '');
              if (finalPrompt) break;
            }
          }
        }

        if (!finalPrompt) {
          finalPrompt = 'Creative content';
        }
      }

      // Look up actual LoRA data if names provided
      let resolvedLoras: any[] = [];
      if (finalLoraNames.length > 0) {
        try {
          const baseUrl = process.env.PUBLIC_API_BASE_URL || `http://localhost:3000`;
          const res = await fetch(`${baseUrl}/api/loras`, { method: 'GET' });
          if (res.ok) {
            const allLoras = await res.json();
            resolvedLoras = finalLoraNames.map(name => {
              const cleanName = name.toLowerCase().trim();
              return allLoras.find((l: any) =>
                (l.canvasName && l.canvasName.toLowerCase().includes(cleanName)) ||
                (l.triggerWord && l.triggerWord.toLowerCase().includes(cleanName)) ||
                (cleanName.includes(l.canvasName?.toLowerCase() || ''))
              );
            }).filter(Boolean).map((l: any) => ({
              path: l.artifactUrl || l.path,
              scale: 1.0,
              triggerWord: l.triggerWord,
              canvasName: l.canvasName
            }));
          }
        } catch (e) {
          console.warn('Failed to resolve LoRA names:', e);
        }
      }

      return {
        action: 'prepareGenerate',
        payload: {
          type: finalType,
          prompt: finalPrompt,
          model: resolvedLoras.length > 0 ? 'fal-ai/flux-lora' : (model || 'default'),
          refs: refs || [],
          options: resolvedLoras.length > 0 ? { loras: resolvedLoras } : {},
          originalRequest: userRequest,
          extractedLoraNames: finalLoraNames,
          resolvedLoras: resolvedLoras
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
      // Return a structured action so the UI can treat this as assistant text clearly
      return { action: 'chat', payload: { text: response } };
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
    description: 'Set name/title for generated images or videos. For "save as filename" requests, extract the filename.',
    parameters: z.object({
      imageId: z.string().optional(),
      name: z.string().optional(),
      userRequest: z.string().optional().describe('Full user request to extract filename from'),
    }),
    execute: async ({ imageId, name, userRequest }) => {
      let finalName = name || 'Untitled';

      // Try to extract filename from "save as filename" pattern
      if (!name && userRequest) {
        const saveAsMatch = userRequest.match(/\b(save|name|call)\s+((this\s+)?(image|picture|photo|video)\s+)?as\s+([\w\-_]+)\b/i);
        if (saveAsMatch && saveAsMatch[5]) {
          finalName = saveAsMatch[5];
        }
      }

      return {
        action: 'nameImage',
        payload: {
          imageId: imageId || 'current',
          name: finalName,
          extractedFromRequest: !!userRequest
        }
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
    description: 'Apply LoRA model to canvas generation. Extract LoRA name from user request like "use petaflop sheen lora"',
    parameters: z.object({
      userRequest: z.string().describe('Full user request to extract LoRA name from'),
      loraName: z.string().optional().describe('Explicit LoRA name if known'),
      strength: z.number().optional(),
      trigger: z.string().optional(),
    }),
    execute: async ({ userRequest, loraName, strength, trigger }) => {
      let finalLoraName = loraName;

      // Extract LoRA name from request if not provided explicitly
      if (!finalLoraName && userRequest) {
        // Pattern: "use [the] [name] lora"
        const match = userRequest.match(/\b(use|apply|add)\s+(?:the\s+)?(.*?)\s+lora\b/i);
        if (match && match[2]) {
          finalLoraName = match[2].trim();
        }
      }

      return {
        action: 'useCanvasLora',
        payload: { loraName: finalLoraName || 'unknown', strength: strength || 1.0, trigger: trigger || '' }
      };
    }
  }),

  listLoras: tool({
    description: 'List all available LoRA models for image generation. Use when user asks about LoRAs, models, styles, or wants to see what custom models are available.',
    parameters: z.object({}),
    execute: async () => {
      try {
        const baseUrl = process.env.PUBLIC_API_BASE_URL || `http://localhost:3000`;
        const url = `${baseUrl}/api/loras`;
        const res = await fetch(url, { method: 'GET' });
        if (!res.ok) throw new Error(`LoRA list failed: ${res.status}`);
        const loras = await res.json();

        if (!Array.isArray(loras) || loras.length === 0) {
          return { action: 'chat', payload: { text: 'No LoRA models found. LoRAs are custom styles trained from canvas images that can be used for generation.' } };
        }

        const loraList = loras.map(l =>
          `• **${l.canvasName}** (${l.triggerWord}) - Canvas: ${l.canvasId}`
        ).join('\n');

        return {
          action: 'chat',
          payload: {
            text: `Found ${loras.length} available LoRA models:\n\n${loraList}\n\nTo use a LoRA, select it in the Generate tab and it will automatically switch to the FLUX-LoRA model for image generation.`
          }
        };
      } catch (error) {
        return { action: 'chat', payload: { text: `Failed to fetch LoRA models: ${error instanceof Error ? error.message : 'Unknown error'}` } };
      }
    }
  }),

};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Updated: Working agent with proper tool calling

export async function POST(req: NextRequest) {
  const { messages } = await req.json();

  // Extract the latest user message
  const lastUserMessage = Array.isArray(messages)
    ? [...messages].reverse().find((m: any) => m?.role === 'user')?.content ?? ''
    : '';
  const userMessage = typeof lastUserMessage === 'string' ? lastUserMessage : '';

  try {
    // Route to the Phase 2 comprehensive agent system
    const agentResponse = await fetch(`${process.env.LANCEDB_API_URL}/api/agent-comprehensive`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: userMessage,
        userId: 'workshop-user',
        tenantId: 'default'
      })
    });

    if (!agentResponse.ok) {
      throw new Error(`Agent request failed: ${agentResponse.status}`);
    }

    const agentResult = await agentResponse.json();

    // Convert the Phase 2 response into a sequence of actionable UI events
    // Process steps even if workflow failed, as long as there are executed steps to emit
    if (agentResult.success || (agentResult.execution?.executedSteps?.length > 0)) {
      const encoder = new TextEncoder();
      const correlationId = agentResult.correlationId || `corr_${Date.now()}`;

      // Helper: extract simple query/name from user message
      const extractQuery = (msg: string) => {
        const patterns = [
          /search for ([^.!?]+)/i,
          /find (?:me\s+)?([^.!?]+)/i,
          /show me ([^.!?]+)/i,
        ];
        for (const p of patterns) {
          const m = msg.match(p);
          if (m && m[1]) return m[1].trim();
        }
        return msg.trim();
      };
      const extractName = (msg: string) => {
        const m = msg.match(/\b(save|name|rename|call)\s+(?:this\s+)?(?:image|picture|photo|video)?\s*(?:as|to)\s+([\w\-_.]+)/i);
        return m && m[2] ? m[2] : undefined;
      };

      // Robust numeric extraction for requested counts (e.g., "3", "three", "couple", "a few")
      const extractRequestedCount = (msg: string, defaultCount: number, maxCount: number): number => {
        const lower = msg.toLowerCase();
        const wordToNum: Record<string, number> = {
          'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
          'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
          'couple': 2, 'a couple': 2, 'few': 3, 'a few': 3
        };
        for (const [word, num] of Object.entries(wordToNum)) {
          if (lower.includes(word)) return Math.min(num, maxCount);
        }
        const digitMatch = lower.match(/\b(\d{1,2})\b/);
        if (digitMatch) {
          const n = parseInt(digitMatch[1], 10);
          if (!Number.isNaN(n) && n > 0) return Math.min(n, maxCount);
        }
        return Math.min(defaultCount, maxCount);
      };

      const events: any[] = [];
      let searchResults: any[] = [];

      // 1) Always send a chat acknowledgement with summary + correlation
      events.push({
        action: 'chat',
        payload: {
          text: agentResult.message || (agentResult.success ? 'Working on it…' : 'Encountered an issue, but processing what I can…'),
          execution: agentResult.execution,
          cost: agentResult.cost,
          correlationId,
          hasError: !agentResult.success
        }
      });

      // 2) Generalized: emit UI event for each workflow step, gated by client acks in Redis
      // Use executedSteps if available (new backend), fallback to planned steps (old backend)
      const executedSteps = agentResult?.execution?.executedSteps || [];
      const plannedSteps = agentResult?.execution?.intent?.workflow_steps || [];
      const steps = executedSteps.length > 0 ? executedSteps : plannedSteps;

      console.log(`[${correlationId}] PROXY: Backend response structure:`, JSON.stringify({
        success: agentResult.success,
        execution: !!agentResult.execution,
        intent: !!agentResult.execution?.intent,
        executedSteps: executedSteps.length,
        plannedSteps: plannedSteps.length,
        usingExecutedSteps: executedSteps.length > 0,
        steps: steps.map(s => s?.tool_name),
        raw_steps: steps
      }));
      console.log(`[${correlationId}] PROXY: Processing ${steps.length} workflow steps:`, steps.map(s => `${s?.tool_name}(${JSON.stringify(s?.parameters)})`));
      const waitForAck = async (corr: string, stepName: string, timeoutMs = 60000) => {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
          try {
            // Check backend for ack status (backend has VPC Redis access)
            const backendUrl = process.env.LANCEDB_API_URL || 'http://lancedb-bulletproof-simple-alb-705151448.us-east-1.elb.amazonaws.com';
            // Use the comprehensive agent ack endpoint (backend side)
            const response = await fetch(`${backendUrl}/api/agent-comprehensive/ack?correlationId=${encodeURIComponent(corr)}&step=${encodeURIComponent(stepName)}`, {
              method: 'GET',
              headers: { 'Content-Type': 'application/json' }
            });

            if (response.ok) {
              const data = await response.json();
              if (data.acked) {
                console.log(`[${corr}] Step ${stepName} acked, proceeding`);
                return; // Ack received, proceed to next step
              }
            }
          } catch (e) {
            console.warn(`[${corr}] Backend ack check failed:`, e);
          }
          await new Promise(r => setTimeout(r, 500));
        }
        console.warn(`[${corr}] Timeout waiting for ack on step ${stepName}`);
      };

      for (const step of steps) {
        const tool = (step?.tool_name || '').toLowerCase();
        const params = step?.parameters || {};

        console.log(`[${correlationId}] PROXY: Processing step: ${step?.tool_name} -> ${tool}, params:`, JSON.stringify(params));

        // Load UI action mapping from config (with fallback to static map)
        let uiAction: string | undefined;
        try {
          // Try to load from S3 config
          const configResponse = await fetch('https://hh-bot-images-2025-prod.s3.amazonaws.com/config/ui-map.json');
          if (configResponse.ok) {
            const config = await configResponse.json();
            uiAction = config.toolsToActions?.[tool];

            // Check materialization rules
            if (uiAction && config.materializationRules?.[uiAction]) {
              const rule = config.materializationRules[uiAction];
              const needsMaterialize = rule.condition === 'no_content_id' && !params.contentId;
              if (needsMaterialize && rule.prependSteps) {
                for (const prependStep of rule.prependSteps) {
                  const payload = { ...prependStep.payload };
                  // Simple template substitution
                  if (payload.name?.includes('{{')) {
                    payload.name = params.name || extractName(userMessage) || 'Untitled';
                  }
                  if (payload.correlationId === '{{correlationId}}') {
                    payload.correlationId = correlationId;
                  }
                  events.push({ action: prependStep.action, payload });
                }
              }
            }
          }
        } catch (error) {
          console.warn(`[${correlationId}] Failed to load UI map config, using fallback`);
        }

        // Fallback to static mapping if config failed
        if (!uiAction) {
          const toolToActionMap: Record<string, string> = {
            'searchunified': 'searchUnified',
            'preparegenerate': 'prepareGenerate',
            'generatecontent': 'requestPinnedThenGenerate',
            'pintocanvas': 'pinToCanvas',
            'pin': 'pinToCanvas',
            'renameasset': 'nameImage',
            'nameimage': 'nameImage',
            'saveimage': 'saveImage',
            'createcanvas': 'canvasCreated',
            'createproject': 'projectCreated',
            'chat': 'chat'
          };
          uiAction = toolToActionMap[tool];
        }

        console.log(`[${correlationId}] PROXY: Mapped ${tool} -> ${uiAction}`);
        if (uiAction) {
          let payload: any = { ...params, correlationId, originalRequest: userMessage };

          console.log(`[${correlationId}] PROXY: Creating event for ${uiAction} with payload:`, JSON.stringify(payload));

          // Tool-specific payload shaping
          if (tool === 'searchunified') {
            payload.query = params.query || extractQuery(userMessage);
            // The backend doesn't store intermediate results, so we need to extract from the backend execution
            // For now, we'll get search results from the live search API call
            console.log(`[${correlationId}] PROXY: Will fetch search results for pin step`);
            try {
              const searchUrl = `${process.env.LANCEDB_API_URL}/api/unified-search`;
              const searchRes = await fetch(searchUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  query: payload.query,
                  limit: 20
                })
              });
              if (searchRes.ok) {
                const searchData = await searchRes.json();
                const rawResults = searchData.results;
                searchResults = Array.isArray(rawResults) ? rawResults : (Array.isArray(rawResults?.all) ? rawResults.all : []);
                console.log(`[${correlationId}] PROXY: Captured ${searchResults.length} search results for pin step`);
              }
            } catch (e) {
              console.warn(`[${correlationId}] PROXY: Failed to fetch search results:`, e);
            }
          } else if (tool === 'preparegenerate') {
            payload = {
              type: params.type || 'image',
              prompt: params.prompt || params.message || userMessage,
              model: params.model || 'default',
              options: params.options || {},
              refs: params.refs || [],
              originalRequest: userMessage,
              correlationId,
              isFollowUp: false
            };
            // Store deferred materialize steps to emit AFTER prepareGenerate ack
            try {
              // Find current step index by tool_name since object references differ
              const stepIndex = steps.findIndex(s => s?.tool_name === step?.tool_name);
              const next = steps[stepIndex + 1];
              if (next?.tool_name === 'generateContent') {
                console.log(`[${correlationId}] Adding deferred materialize steps for video workflow`);
                payload.__deferredMaterialize = [
                  { action: 'nameImage', payload: { imageId: 'current', name: 'Generated Image', correlationId } },
                  { action: 'saveImage', payload: { imageId: 'current', collection: 'default', correlationId } }
                ];
              }
            } catch {}
          } else if (tool === 'generatecontent') {
            // For generateContent (follow-up), force video and set a sane default i2v model
            payload = {
              type: params.type || 'video',
              prompt: params.prompt || params.message || userMessage,
              model: params.model || 'fal-ai/wan-i2v',
              options: params.options || {},
              originalRequest: userMessage,
              correlationId,
              isFollowUp: true
            };
          } else if (tool === 'pin' || tool === 'pintocanvas') {
            // Pass search results if available, respecting count parameter
            if (searchResults.length > 0) {
              const count = params.count || extractRequestedCount(userMessage, searchResults.length, searchResults.length);
              const itemsToPin = searchResults.slice(0, count);
              payload = {
                items: itemsToPin,
                count: itemsToPin.length,
                originalRequest: userMessage,
                correlationId
              };
              console.log(`[${correlationId}] PROXY: Passing ${itemsToPin.length} search results to pinToCanvas`);
            } else {
              payload = {
                id: params.contentId || null,
                contentId: params.contentId || null,
                // Try to carry intent forward even if we failed to prefetch results
                needsLookup: !params.contentId,
                count: typeof params.count === 'number' ? params.count : extractRequestedCount(userMessage, 2, 10),
                originalRequest: userMessage,
                correlationId
              };
            }
          } else if (tool === 'nameimage' || tool === 'renameasset') {
            payload = {
              imageId: params.imageId || params.assetId || 'current',
              name: params.name || params.newFilename || extractName(userMessage) || 'Untitled',
              correlationId
            };
            // If immediate save step follows, carry the chosen name forward so UI can use it
            try {
              const stepIndex = steps.findIndex(s => s?.tool_name?.toLowerCase() === tool);
              const next = steps[stepIndex + 1];
              if (next?.tool_name && next.tool_name.toLowerCase() === 'saveimage') {
                events.push({ action: 'saveImage', payload: { name: payload.name, correlationId } });
                console.log(`[${correlationId}] PROXY: Injected saveImage with name '${payload.name}' right after nameImage`);
              }
            } catch {}
          }

          // Queue the step; ack gating will occur during streaming emission
          events.push({ action: uiAction, payload });
          console.log(`[${correlationId}] PROXY: Queued event ${events.length}: ${uiAction}`);
        } else {
          console.warn(`[${correlationId}] PROXY: No UI action mapped for tool: ${tool} (${step?.tool_name})`);
        }
      }

      console.log(`[${correlationId}] PROXY: Total events queued: ${events.length}`, events.map(e => e.action));

      // Fallback injection: if user asked to pin and planner omitted a pin step,
      // but we captured search results, inject a pinToCanvas step.
      try {
        const hasSearch = events.some(e => (e.action || '').toLowerCase() === 'searchunified');
        const hasPin = events.some(e => (e.action || '').toLowerCase() === 'pintocanvas');
        const userAskedToPin = /\b(pin|canvas)\b/i.test(userMessage);
        if (hasSearch && !hasPin && userAskedToPin && Array.isArray(searchResults) && searchResults.length > 0) {
          let requestedCount = searchResults.length;
          if (/\bfour\b/i.test(userMessage) || /\b4\b/.test(userMessage)) {
            requestedCount = Math.min(4, searchResults.length);
          }
          const itemsToPin = searchResults.slice(0, requestedCount);
          events.push({
            action: 'pinToCanvas',
            payload: { items: itemsToPin, count: itemsToPin.length, originalRequest: userMessage, correlationId }
          });
          console.log(`[${correlationId}] PROXY: Injected fallback pinToCanvas with ${itemsToPin.length} items`);
        }
      } catch (e) {
        console.warn(`[${correlationId}] PROXY: Failed to inject fallback pinToCanvas:`, e);
      }

      // 3) Remove heuristic fallbacks since backend now plans all steps

      const stream = new ReadableStream({
        async start(controller) {
          try {
            // Emit first event (chat acknowledgment)
            if (events.length > 0) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(events[0])}\n\n`));
            }

            // For remaining events, emit one at a time with Redis gating
            for (let i = 1; i < events.length; i++) {
              const evt = events[i];
              const stepName = evt.action.toLowerCase();

              console.log(`[${correlationId}] PROXY: About to emit event ${i}/${events.length-1}: ${stepName}`);

              // Wait for previous step to be acked before emitting next
              if (i > 1) {
                const prevStepName = events[i-1].action.toLowerCase();
                console.log(`[${correlationId}] PROXY: Waiting for ack on previous step: ${prevStepName}`);
                await waitForAck(correlationId, prevStepName);
                console.log(`[${correlationId}] PROXY: Got ack for ${prevStepName}, proceeding with ${stepName}`);
              }

              controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`));
              console.log(`[${correlationId}] PROXY: ✅ Emitted step: ${stepName}`);

              // If this was prepareGenerate with deferred materialization, wait for its ack then emit deferred steps
              if (stepName === 'preparegenerate' && evt.payload?.__deferredMaterialize) {
                try {
                  const deferred = Array.isArray(evt.payload.__deferredMaterialize)
                    ? evt.payload.__deferredMaterialize
                    : [];
                  if (deferred.length > 0) {
                    console.log(`[${correlationId}] Waiting for preparegenerate ack before emitting ${deferred.length} deferred steps`);
                    await waitForAck(correlationId, 'preparegenerate');
                    console.log(`[${correlationId}] preparegenerate acked, now emitting deferred steps`);

                    for (const deferredEvt of deferred) {
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify(deferredEvt)}\n\n`));
                      console.log(`[${correlationId}] Emitted deferred step: ${deferredEvt.action.toLowerCase()}`);

                      // Auto-ack the deferred step immediately since it's UI-only
                      const deferredStepName = deferredEvt.action.toLowerCase();
                      try {
                        const backendUrl = process.env.LANCEDB_API_URL || '';
                        setTimeout(async () => {
                          try {
                            await fetch(`${backendUrl}/api/agent-comprehensive/ack`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                correlationId,
                                step: deferredStepName,
                                artifacts: { synthetic: true, deferred: true }
                              })
                            });
                          } catch {}
                        }, 100);
                      } catch {}
                    }
                  }
                } catch (e) {
                  console.warn(`[${correlationId}] Failed to emit deferred steps:`, e);
                }
              }

              // Safety: auto-ack UI-only steps immediately to avoid gating delays
              if (stepName === 'nameimage' || stepName === 'saveimage') {
                try {
                  const backendUrl = process.env.LANCEDB_API_URL || '';
                  // Immediate auto-ack to prevent proxy waiting
                  setTimeout(async () => {
                    try {
                      await fetch(`${backendUrl}/api/agent-comprehensive/ack`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          correlationId,
                          step: stepName,
                          artifacts: { synthetic: true, immediate: true }
                        })
                      });
                      console.log(`[${correlationId}] Auto-acked ${stepName} immediately`);
                    } catch {}
                  }, 100); // Much shorter delay
                } catch {}
              }
            }
          } catch (error) {
            console.error(`[${correlationId}] Stream error:`, error);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              action: 'error',
              payload: { message: 'Workflow failed', error: error.message, correlationId }
            })}\n\n`));
          } finally {
            controller.close();
          }
        }
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        },
      });
    } else {
      // Handle error case
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          const errorAction = {
            action: 'chat',
            payload: {
              text: `I encountered an issue: ${agentResult.message || 'Unknown error'}`,
              error: true
            }
          };

          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorAction)}\n\n`));
          controller.close();
        }
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }
  } catch (error) {
    console.error('Phase 2 agent request failed:', error);

    // Fallback to original system if Phase 2 is unavailable
    const lastText = userMessage;
  const searchIntentRegex = /\b(search|find|show|pull\s*up|dig\s*up|pics?|pictures?|images?|photos?|media|video|videos|audio|songs?|music|look.*up|gimme|give me|some|any|all|the)\s+(videos?|images?|pictures?|photos?|pics?|audio|songs?|music|tracks?|media|content|files?|assets?|artworks?|visuals?|footage|clips?|movies?|films?|animations?|recordings?|sounds?|vocals?|documents?|articles?|posts?|writings?|stories?|text)\b|\b(videos?|images?|pictures?|photos?|pics?|audio|songs?|music|tracks?|media|content|files?|assets?|artworks?|visuals?|footage|clips?|movies?|films?|animations?|recordings?|sounds?|vocals?)\s+(of|about|with|for|from|like|that|related|containing)\b/i;
  const greetingIntentRegex = /\b(hi|hello|hey|yo|sup|what's up|wassup)\b/i;
  const generateIntentRegex = /\b(make|create|generate|produce|build|design|craft|draw|paint|render|synthesize)\b/i;

  const forcedToolChoice: any =
      searchIntentRegex.test(lastText) ? { type: 'tool', toolName: 'searchUnified' }
      : generateIntentRegex.test(lastText) ? { type: 'tool', toolName: 'prepareGenerate' }
      : greetingIntentRegex.test(lastText) ? { type: 'tool', toolName: 'chat' }
                    : 'auto';

  const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY! });

  const result = await streamText({
    model: openai('gpt-4o-mini') as any,
      system: 'You are a helpful assistant. The advanced agent system is temporarily unavailable, so provide a simple response using the available tools.',
    messages,
    tools,
    toolChoice: forcedToolChoice,
    maxSteps: 1,
  });

  return result.toDataStreamResponse();
  }
}


