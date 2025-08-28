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
      console.log(`[prepareGenerate] Received parameters:`, { userRequest, type, prompt, model, refs, loraNames });
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

      // Use LoRA names and prompt from planner (S3 rules now handle extraction)
      let finalLoraNames = loraNames || [];
      let finalPrompt = prompt || userRequest;

      // Look up actual LoRA data if names provided
      let resolvedLoras: any[] = [];
      console.log(`[prepareGenerate] LoRA names to resolve:`, finalLoraNames);
      if (finalLoraNames.length > 0) {
        try {
          const baseUrl = process.env.PUBLIC_API_BASE_URL || `http://localhost:3000`;
          const res = await fetch(`${baseUrl}/api/loras`, { method: 'GET' });
          console.log(`[prepareGenerate] LoRA fetch response ok:`, res.ok);
          if (res.ok) {
            const allLoras = await res.json();
            console.log(`[prepareGenerate] Available LoRAs:`, allLoras.length, allLoras.map(l => l.canvasName));
            resolvedLoras = finalLoraNames.map(name => {
              const cleanName = name.toLowerCase().trim();
              const found = allLoras.find((l: any) =>
                (l.canvasName && l.canvasName.toLowerCase().includes(cleanName)) ||
                (l.triggerWord && l.triggerWord.toLowerCase().includes(cleanName)) ||
                (cleanName.includes(l.canvasName?.toLowerCase() || ''))
              );
              console.log(`[prepareGenerate] Searching for "${cleanName}", found:`, found?.canvasName);
              return found;
            }).filter(Boolean).map((l: any) => ({
              path: l.artifactUrl || l.path,
              scale: 1.0,
              triggerWord: l.triggerWord,
              canvasName: l.canvasName
            }));
            console.log(`[prepareGenerate] Resolved LoRAs:`, resolvedLoras);
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

  // Extract structured visual context summary if present in the user message
  // Marker format from frontend: __CONTEXT_VISUAL_SUMMARY__:{"...prompt..."}
  let contextVisualSummary: string | undefined;
  let cleanedUserMessage = userMessage;
  try {
    const markerIdx = userMessage.lastIndexOf('__CONTEXT_VISUAL_SUMMARY__:');
    if (markerIdx >= 0) {
      // Extract the context summary
      const markerPayload = userMessage.slice(markerIdx + '__CONTEXT_VISUAL_SUMMARY__:'.length).trim();
      try {
        contextVisualSummary = JSON.parse(markerPayload);
      } catch {
        // Try lax parse: strip trailing lines
        const firstLine = markerPayload.split('\n')[0];
        try { contextVisualSummary = JSON.parse(firstLine); } catch {}
      }
      
      // Clean the user message by removing the marker and everything after it
      cleanedUserMessage = userMessage.slice(0, markerIdx).trim();
      console.log(`[${correlationId}] PROXY: Extracted context visual summary, cleaned message: "${cleanedUserMessage}"`);
    }
  } catch {}

  try {
    // Route to the Phase 2 comprehensive agent system
    const agentResponse = await fetch(`${process.env.LANCEDB_API_URL}/api/agent-comprehensive`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: cleanedUserMessage,
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
        const text = String(msg || '');
        const patterns: RegExp[] = [
          /\b(?:save|name|rename|call)\s+(?:this\s+)?(?:image|picture|photo|video|it)?\s*(?:as|to)?\s*"([^"]{1,100})"/i,
          /\b(?:save|name|rename|call)\s+(?:this\s+)?(?:image|picture|photo|video|it)?\s*(?:as|to)?\s*'([^']{1,100})'/i,
          /\bcall\s+(?:it\s+)?([a-z0-9][\w\- ]{1,100}?)(?=(?:\s+and\b|\s*,|\s*\.|$))/i,
          /\b(?:name|rename)\s+(?:it\s+)?(?:to\s+)?([a-z0-9][\w\- ]{1,100}?)(?=(?:\s+and\b|\s*,|\s*\.|$))/i,
          /\bsave\s+(?:it\s+)?(?:as\s+)?([a-z0-9][\w\- ]{1,100}?)(?=(?:\s+and\b|\s*,|\s*\.|$))/i,
        ];
        for (const p of patterns) {
          const m = text.match(p);
          if (m && m[1]) return m[1].trim();
        }
        return undefined;
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
      let resolvedRefs: string[] = []; // Store refs from resolveAssetRefs for next step

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

      // CRITICAL FIX: If planned steps include resolveAssetRefs but executed steps don't,
      // use planned steps to ensure resolveAssetRefs gets executed by the proxy
      const hasResolveAssetRefs = plannedSteps.some((s: any) => s?.tool_name === 'resolveAssetRefs');
      const executedHasResolveAssetRefs = executedSteps.some((s: any) => s?.tool_name === 'resolveAssetRefs');

      let steps = (hasResolveAssetRefs && !executedHasResolveAssetRefs)
        ? plannedSteps  // Use planned steps when backend skipped resolveAssetRefs
        : (executedSteps.length > 0 ? executedSteps : plannedSteps);

      // If backend returned planned pin step but did not execute it (common when parameters were missing),
      // ensure the proxy still emits a pinToCanvas UI action at the end so UI can pin generated content.
      try {
        const planHasPin = plannedSteps.some((s: any) => (s?.tool_name || '').toLowerCase() === 'pintocanvas');
        const executedHasPin = executedSteps.some((s: any) => (s?.tool_name || '').toLowerCase() === 'pintocanvas');
        if (planHasPin && !executedHasPin) {
          steps = [...steps, { tool_name: 'pinToCanvas', parameters: {} }];
          console.log(`[${correlationId}] PROXY: Appended pinToCanvas step since planner included it but backend did not execute it`);
        }
      } catch {}

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
      console.log(`[${correlationId}] PROXY: Full workflow steps received from backend:`, JSON.stringify(steps, null, 2));
      
      // Track artifacts from previous steps for chaining
      const stepArtifacts: Record<string, any> = {};
      
      const waitForAck = async (corr: string, stepName: string, timeoutMs = 60000) => {
        const start = Date.now();
        console.log(`[${corr}] PROXY: Starting waitForAck for step: ${stepName}, timeout: ${timeoutMs}ms`);
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
              console.log(`[${corr}] PROXY: Ack check response data:`, data);
              if (data.acked || data.acknowledged) {
                console.log(`[${corr}] PROXY: ✅ Step ${stepName} acked, proceeding`);
                // Capture artifacts from this step for use in subsequent steps
                if (data.artifacts) {
                  stepArtifacts[stepName] = data.artifacts;
                  console.log(`[${corr}] PROXY: Captured artifacts for ${stepName}:`, data.artifacts);
                }
                return true; // Ack received, proceed to next step
              } else {
                console.log(`[${corr}] PROXY: ⏳ Step ${stepName} not yet acknowledged, continuing to wait...`);
              }
            } else {
              console.warn(`[${corr}] PROXY: Ack check failed with status: ${response.status}`);
            }
          } catch (e) {
            console.warn(`[${corr}] Backend ack check failed:`, e);
          }
          await new Promise(r => setTimeout(r, 500));
        }
        console.warn(`[${corr}] PROXY: ❌ Timeout waiting for ack on step: ${stepName} after ${timeoutMs}ms`);
        return false;
      };

      for (const step of steps) {
        const tool = (step?.tool_name || '').toLowerCase();
        const params = step?.parameters || {};

        console.log(`[${correlationId}] PROXY: Processing step: ${step?.tool_name} -> ${tool}, params:`, JSON.stringify(params));

        // REMOVED: Fallback parameter extraction - S3 planner rules now handle parameter extraction properly

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
            'resolveassetrefs': 'BACKEND_ONLY',
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

        // Handle BACKEND_ONLY tools
        if (uiAction === 'BACKEND_ONLY') {
          console.log(`[${correlationId}] BACKEND_ONLY: Executing ${tool} on backend`);

          if (tool === 'resolveassetrefs') {
            try {
              // Execute resolveAssetRefs on local backend
              // Extract asset identifiers from user message if not provided in params
              let identifiers = params.identifiers || [];
              if (identifiers.length === 0) {
                // Extract asset IDs, filenames, or names from user message
                const assetIdMatch = userMessage.match(/(?:asset ID|asset id|ID):\s*([a-f0-9-]+)/i);
                const filenameMatch = userMessage.match(/(?:using|with|from)\s+([a-zA-Z0-9_.-]+\.[a-zA-Z0-9]+)/i);
                const nameMatch = userMessage.match(/(?:using|with|from)\s+([a-zA-Z0-9_-]+)/i);

                if (assetIdMatch) identifiers.push(assetIdMatch[1]);
                else if (filenameMatch) identifiers.push(filenameMatch[1]);
                else if (nameMatch) identifiers.push(nameMatch[1]);

                console.log(`[${correlationId}] BACKEND_ONLY: Extracted identifiers from message:`, identifiers);
              }

              const backendResponse = await fetch(`${process.env.PUBLIC_API_BASE_URL || 'http://localhost:3000'}/api/tools/resolveAssetRefs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  identifiers,
                  preferred: params.preferred || 'any',
                  userId: 'workshop-user'
                })
              });

              if (backendResponse.ok) {
                const result = await backendResponse.json();
                console.log(`[${correlationId}] BACKEND_ONLY: resolveAssetRefs resolved ${result.refs?.length || 0} refs`);

                // Store resolved refs for next step (generateContent)
                resolvedRefs = result.refs || [];
              } else {
                console.warn(`[${correlationId}] BACKEND_ONLY: resolveAssetRefs failed:`, backendResponse.status);
              }
            } catch (error) {
              console.error(`[${correlationId}] BACKEND_ONLY: resolveAssetRefs error:`, error);
            }
          }

          // Skip to next step - backend-only tools don't generate UI events
          continue;
        }

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
              prompt: (contextVisualSummary || params.prompt || params.message || userMessage),
              model: params.model || 'default',
              options: params.options || {},
              refs: params.refs || [],
              loraNames: params.loraNames || [], // CRITICAL: Pass through LoRA names from backend planner
              originalRequest: userMessage,
              correlationId,
              isFollowUp: false
            };
            console.log(`[${correlationId}] PROXY: prepareGenerate with LoRAs:`, params.loraNames);
            // Removed deferred materialization; rely on explicit planner steps.
          } else if (tool === 'generatecontent') {
            // For generateContent (follow-up), force video and set a sane default i2v model
            payload = {
              type: params.type || 'video',
              prompt: (contextVisualSummary || params.prompt || params.message || userMessage),
              model: params.model || 'fal-ai/wan-i2v',
              // Pass resolved refs from previous resolveAssetRefs step
              assetRefs: resolvedRefs.length > 0 ? resolvedRefs : undefined,
              options: params.options || {},
              originalRequest: userMessage,
              correlationId,
              isFollowUp: true
            };
            // If no resolved refs yet, UI will fall back to current generated image or pinned items
            if (!payload.prompt || payload.prompt === userMessage) {
              // Minimal prompt extraction for follow-up video requests
              const cleaned = userMessage.replace(/^(now\s+)?(use|take|with)\s+the\s+pinned\s+image\s+to\s+(make|create|generate)\s+\w*\s*video\s*(of|about)?\s*/i, '').trim();
              payload.prompt = cleaned || 'video';
            }
          } else if (tool === 'nameimage') {
            // Trust planner-extracted name; minimal fallback only
            payload = {
              ...params,
              name: params.name || extractName(userMessage) || 'Untitled',
              correlationId,
              originalRequest: userMessage
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
              // Check if we have assetId from previous saveImage step
              const saveImageArtifacts = stepArtifacts['saveimage'];
              const assetIdFromPrevious = saveImageArtifacts?.assetId;
              
              payload = {
                id: params.contentId || assetIdFromPrevious || null,
                contentId: params.contentId || assetIdFromPrevious || null,
                // Try to carry intent forward even if we failed to prefetch results
                needsLookup: !params.contentId && !assetIdFromPrevious,
                count: typeof params.count === 'number' ? params.count : extractRequestedCount(userMessage, 2, 10),
                originalRequest: userMessage,
                correlationId
              };
              
              if (assetIdFromPrevious) {
                console.log(`[${correlationId}] PROXY: Injected assetId from saveImage artifacts: ${assetIdFromPrevious}`);
              }
            }
          } else if (tool === 'nameimage' || tool === 'renameasset') {
            payload = {
              imageId: params.imageId || params.assetId || 'current',
              name: params.name || params.newFilename || extractName(userMessage) || 'Untitled',
              correlationId,
              originalRequest: userMessage
            };
            // REMOVED: Do not inject additional saveImage steps - trust the planner workflow
            // The backend planner already includes complete workflows from S3 config
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
              console.log(`[${correlationId}] PROXY: Previous event was:`, JSON.stringify(events[i-1], null, 2));
              await waitForAck(correlationId, prevStepName);
              console.log(`[${correlationId}] PROXY: Got ack for ${prevStepName}, proceeding with ${stepName}`);
              }

              controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`));
              console.log(`[${correlationId}] PROXY: ✅ Emitted step: ${stepName}`);

              // REMOVED: Auto-ack logic that was interfering with proper workflow sequencing
              // Let the frontend handlers send their own acknowledgments after completing their work
              // This ensures proper sequencing and prevents duplicate calls
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


