import { z } from 'zod';
import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';

// Intent classification schema
export const IntentSchema = z.object({
  primary_intent: z.enum([
    'search',
    'create',
    'update',
    'delete',
    'analyze',
    'generate',
    'organize',
    'upload',
    'export',
    'chat',
    'help'
  ]).describe('The primary action the user wants to perform'),

  confidence: z.number().min(0).max(1).describe('Confidence score for the classification'),

  entities: z.object({
    media_type: z.enum(['image', 'video', 'audio', 'layout', 'canvas', 'project', 'any']).optional().describe('Type of media involved'),
    target_name: z.string().optional().describe('Name of specific item to act on'),
    search_query: z.string().optional().describe('Search terms if applicable'),
    creation_type: z.string().optional().describe('Type of item to create'),
    modification_details: z.string().optional().describe('What changes to make'),
    generation_prompt: z.string().optional().describe('Prompt for AI generation'),
    organization_action: z.enum(['pin', 'group', 'tag', 'categorize']).optional().describe('How to organize content')
  }).describe('Extracted entities and parameters'),

  workflow_steps: z.array(z.object({
    tool_name: z.string().describe('Name of tool to execute'),
    parameters: z.record(z.any()).describe('Parameters for the tool'),
    depends_on: z.array(z.number()).optional().describe('Indices of steps this depends on')
  })).describe('Sequence of tools to execute to fulfill the intent'),

  reasoning: z.string().describe('Explanation of the classification and workflow')
});

export type Intent = z.infer<typeof IntentSchema>;

export class IntentClassifier {
  private model = openai('gpt-4o-2024-08-06');
  private totalCost = 0;
  private requestCount = 0;

  constructor(private availableTools: string[]) {}

  async classifyIntent(
    userMessage: string,
    context?: {
      userId: string;
      recentSearches?: string[];
      currentCanvas?: string;
      currentProject?: string;
    }
  ): Promise<{ intent: Intent; cost: number; correlationId: string }> {
    const correlationId = `intent_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    const startTime = Date.now();

    console.log(`[${correlationId}] Classifying intent: "${userMessage}"`);

    try {
      const systemPrompt = this.buildSystemPrompt(context);

      const result = await generateObject({
        model: this.model as any,
        schema: IntentSchema,
        system: systemPrompt,
        prompt: userMessage,
        temperature: 0.1, // Low temperature for consistent classification
      });

      const processingTime = Date.now() - startTime;
      const estimatedCost = this.estimateCost(userMessage, JSON.stringify(result.object));

      this.totalCost += estimatedCost;
      this.requestCount++;

      console.log(`[${correlationId}] Intent classified: ${result.object.primary_intent} (confidence: ${result.object.confidence}, cost: $${estimatedCost.toFixed(4)}, time: ${processingTime}ms)`);

      return {
        intent: result.object,
        cost: estimatedCost,
        correlationId
      };

    } catch (error) {
      console.error(`[${correlationId}] Intent classification failed:`, error);

      // Fallback to basic intent
      const fallbackIntent: Intent = {
        primary_intent: 'chat',
        confidence: 0.1,
        entities: {},
        workflow_steps: [{
          tool_name: 'chat',
          parameters: { message: userMessage }
        }],
        reasoning: 'Failed to classify intent, defaulting to chat'
      };

      return {
        intent: fallbackIntent,
        cost: 0,
        correlationId
      };
    }
  }

  private buildSystemPrompt(context?: {
    userId: string;
    recentSearches?: string[];
    currentCanvas?: string;
    currentProject?: string;
  }): string {
    const availableToolsList = this.availableTools.join(', ');

    let contextInfo = '';
    if (context) {
      contextInfo = `
CURRENT CONTEXT:
- User ID: ${context.userId}
- Recent searches: ${context.recentSearches?.join(', ') || 'none'}
- Current canvas: ${context.currentCanvas || 'none'}
- Current project: ${context.currentProject || 'none'}
`;
    }

    return `You are an intelligent intent classifier for a multimedia worldbuilding platform. Your job is to understand user requests and convert them into executable workflows using available tools.

AVAILABLE TOOLS: ${availableToolsList}

${contextInfo}

CLASSIFICATION GUIDELINES:

1. SEARCH INTENT: User wants to find content
   - Examples: "find images of cats", "search for videos", "show me layouts"
   - Tools: searchUnified, searchKeyframes, listMediaAssets, listLayouts, listSongs

2. CREATE INTENT: User wants to make something new
   - Examples: "create a canvas", "make a new project", "start a layout"
   - Tools: createCanvas, createProject, generateContent

3. UPDATE INTENT: User wants to modify existing content
   - Examples: "rename this file", "edit lyrics", "update canvas"
   - Tools: renameAsset, updateSongLyrics, updateCanvas, updateAsset

4. GENERATE INTENT: User wants AI to create content
   - Examples: "generate an image", "create a video", "make music"
   - Tools: generateContent, callFal, getFalModels

5. ORGANIZE INTENT: User wants to arrange or categorize content
   - Examples: "pin to canvas", "add to project", "organize these items"
   - Tools: pinToCanvas, duplicateLayout, updateCanvas

6. ANALYZE INTENT: User wants to process or understand content
   - Examples: "analyze this video", "extract keyframes", "get asset info"
   - Tools: analyzeVideo, getMediaAsset, convertKeyframeToImage

7. UPLOAD INTENT: User wants to add new files
   - Examples: "upload a video", "import from URL", "add new media"
   - Tools: getUploadUrl, finishUpload, importFromUrl

WORKFLOW GENERATION:
- Break complex requests into sequential tool calls
- Use context to fill in missing parameters
- Ensure each step has proper dependencies
- Provide high confidence (>0.8) for clear intents
- Use lower confidence (<0.5) for ambiguous requests

PARAMETER RESOLUTION:
- Extract specific names, types, and actions from user message
- Use context to resolve ambiguous references ("this", "that", "current")
- Provide reasonable defaults when parameters are missing
- Include userId in all tool parameters that require context

Be precise, actionable, and always explain your reasoning.`;
  }

  private estimateCost(input: string, output: string): number {
    // GPT-4o pricing (approximate)
    const inputTokens = Math.ceil(input.length / 4); // Rough token estimation
    const outputTokens = Math.ceil(output.length / 4);

    const inputCost = (inputTokens / 1000) * 0.0025; // $2.50 per 1K input tokens
    const outputCost = (outputTokens / 1000) * 0.01; // $10.00 per 1K output tokens

    return inputCost + outputCost;
  }

  getUsageStats() {
    return {
      totalCost: this.totalCost,
      requestCount: this.requestCount,
      averageCost: this.requestCount > 0 ? this.totalCost / this.requestCount : 0,
      estimatedMonthlyBudget: this.totalCost * 30 // Rough monthly projection
    };
  }

  resetUsageStats() {
    this.totalCost = 0;
    this.requestCount = 0;
  }
}
