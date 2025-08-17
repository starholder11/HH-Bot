import { NextRequest } from 'next/server';
import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { ToolRegistry } from '../../../services/tools/ToolRegistry';
import { RedisContextService } from '../../../services/context/RedisContextService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Initialize services
const contextService = new RedisContextService(process.env.REDIS_URL || 'redis://localhost:6379');
const toolRegistry = new ToolRegistry(contextService);

export async function POST(req: NextRequest) {
  const correlationId = contextService.generateCorrelationId();
  console.log(`[${correlationId}] Agent v2 request received`);

  try {
    const { messages, userId = 'default-user', tenantId = 'default' } = await req.json();

    // Get user context
    const userContext = await contextService.getUserContext(userId, tenantId);
    console.log(`[${correlationId}] User context retrieved for ${userId}`);

    // Get the last user message for intent detection
    const lastUserMessage = Array.isArray(messages)
      ? [...messages].reverse().find((m: any) => m?.role === 'user')?.content ?? ''
      : '';
    const lastText = typeof lastUserMessage === 'string' ? lastUserMessage : '';

    console.log(`[${correlationId}] Processing message: "${lastText.substring(0, 100)}..."`);

    // Enhanced intent detection with context awareness
    const forcedToolChoice = detectIntent(lastText, userContext);
    console.log(`[${correlationId}] Intent detected: ${JSON.stringify(forcedToolChoice)}`);

    // Get AI SDK compatible tools with user context
    const tools = toolRegistry.toAISDKTools({ userId, tenantId });

    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY! });

    const result = await streamText({
      model: openai('gpt-4o-mini') as any,
      system: buildSystemPrompt(userContext),
      messages,
      tools,
      toolChoice: forcedToolChoice,
      maxSteps: 1,
    });

    // Record session event
    await contextService.recordSessionEvent(
      userId,
      tenantId,
      'agent_interaction',
      {
        messageLength: lastText.length,
        detectedIntent: forcedToolChoice,
        correlationId
      }
    );

    console.log(`[${correlationId}] Agent response streaming started`);
    return result.toDataStreamResponse();

  } catch (error) {
    console.error(`[${correlationId}] Agent error:`, error);
    return new Response(
      JSON.stringify({
        error: 'Agent temporarily unavailable',
        correlationId,
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

function detectIntent(text: string, userContext: any): any {
  const textLower = text.toLowerCase();

  // Context-aware intent detection
  const recentSearches = userContext.recentSearches || [];
  const hasRecentSearches = recentSearches.length > 0;

  // Enhanced patterns with context awareness
  const patterns = [
    // Project management
    {
      regex: /\b(create|make|new)\s+(project|workspace)\b/i,
      tool: 'createProject',
      priority: 10
    },
    {
      regex: /\b(list|show|get)\s+(projects|workspaces)\b/i,
      tool: 'listProjects',
      priority: 10
    },

    // Canvas management
    {
      regex: /\b(create|make|new)\s+(canvas|board)\b/i,
      tool: 'createCanvas',
      priority: 10
    },
    {
      regex: /\b(list|show|get)\s+(canvas|canvases|boards)\b/i,
      tool: 'listCanvases',
      priority: 10
    },

    // Search patterns (enhanced with context)
    {
      regex: /\b(search|find|show|pull\s*up|dig\s*up|look.*up|gimme|give me)\s+(videos?|images?|pictures?|photos?|pics?|audio|songs?|music|tracks?|media|content|files?|assets?)\b/i,
      tool: 'searchUnified',
      priority: 9
    },
    {
      regex: /\b(videos?|images?|pictures?|photos?|pics?|audio|songs?|music|tracks?|media|content)\s+(of|about|with|for|from|like|that|related|containing)\b/i,
      tool: 'searchUnified',
      priority: 8
    },

    // Context-aware patterns
    {
      regex: /\b(what|show|get)\s+(context|session|history)\b/i,
      tool: 'getContext',
      priority: 7
    },

    // Fallback search if user has recent searches
    ...(hasRecentSearches ? [{
      regex: /\b(more|similar|related|like that)\b/i,
      tool: 'searchUnified',
      priority: 5
    }] : []),

    // Generation patterns (from original agent)
    {
      regex: /\b(make|create|generate|produce|build|design|craft)\b/i,
      tool: 'prepareGenerate',
      priority: 6
    },

    // Greeting patterns
    {
      regex: /\b(hi|hello|hey|yo|sup|what's up|wassup)\b/i,
      tool: 'chat',
      priority: 3
    }
  ];

  // Find the highest priority matching pattern
  let bestMatch = { tool: 'auto', priority: 0 };

  for (const pattern of patterns) {
    if (pattern.regex.test(textLower) && pattern.priority > bestMatch.priority) {
      bestMatch = { tool: pattern.tool, priority: pattern.priority };
    }
  }

  return bestMatch.tool === 'auto' ? 'auto' : { type: 'tool', toolName: bestMatch.tool };
}

function buildSystemPrompt(userContext: any): string {
  const recentSearches = userContext.recentSearches || [];
  const activeProjects = userContext.activeProjects || [];
  const preferences = userContext.preferences || {};

  let systemPrompt = `You are an advanced tool-calling agent with access to a comprehensive tool registry. Call exactly ONE tool and stop.

AVAILABLE TOOL CATEGORIES:
- Search Tools: searchUnified (with smart media type detection)
- Canvas Tools: createCanvas, listCanvases
- Project Tools: createProject, listProjects
- Utility Tools: getContext

TOOL SELECTION GUIDELINES:
- For ANY search requests: use searchUnified with the query
- For project management: use createProject or listProjects
- For canvas management: use createCanvas or listCanvases
- For context requests: use getContext

CONTEXT AWARENESS:`;

  if (recentSearches.length > 0) {
    systemPrompt += `\n- Recent searches: ${recentSearches.slice(0, 3).join(', ')}`;
  }

  if (activeProjects.length > 0) {
    systemPrompt += `\n- Active projects: ${activeProjects.slice(0, 3).map((p: any) => p.name || p.id).join(', ')}`;
  }

  if (preferences.qualityLevel) {
    systemPrompt += `\n- Quality preference: ${preferences.qualityLevel}`;
  }

  systemPrompt += `

EXECUTION RULES:
- ALWAYS extract full context from user requests
- NEVER call multiple tools in sequence
- NEVER provide text responses after tool calls
- Use correlation IDs for all operations
- Update user context through tool execution

For search requests, the tool automatically:
- Detects media types from queries
- Updates recent search history
- Records session events
- Provides correlation tracking`;

  return systemPrompt;
}

// Health check endpoint
export async function GET(req: NextRequest) {
  const correlationId = contextService.generateCorrelationId();

  try {
    const toolStats = await toolRegistry.getToolStats();
    const contextHealth = await contextService.checkHealth();

    return new Response(JSON.stringify({
      service: 'agent-v2',
      status: 'healthy',
      timestamp: new Date().toISOString(),
      correlationId,
      tools: toolStats,
      context: contextHealth
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      service: 'agent-v2',
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      correlationId,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
