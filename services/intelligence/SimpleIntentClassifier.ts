import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';

// Simplified intent schema for testing
export const SimpleIntentSchema = z.object({
  intent: z.enum(['search', 'create', 'update', 'chat']).describe('Primary user intent'),
  confidence: z.number().min(0).max(1).describe('Confidence score'),
  tool_name: z.string().describe('Recommended tool to use'),
  parameters: z.record(z.any()).optional().default({}).describe('Parameters for the tool'),
  reasoning: z.string().describe('Why this classification was chosen'),
  primary_intent: z.string().optional().describe('Primary intent string'),
  classification: z.string().optional().describe('Classification string'),
  workflow_steps: z.array(z.object({
    tool_name: z.string(),
    parameters: z.record(z.any()).optional().default({}),
    description: z.string().optional()
  })).optional().describe('Workflow steps to execute')
});

export type SimpleIntent = z.infer<typeof SimpleIntentSchema>;

export class SimpleIntentClassifier {
  private model = openai('gpt-4o-mini'); // Use cheaper model for testing
  private totalCost = 0;

  constructor(private llmRouter?: any, private availableTools?: string[]) {
    // Accept optional parameters for compatibility
    this.availableTools = availableTools || [];
  }

  async classifyIntent(userMessage: string, context?: any): Promise<{ intent: SimpleIntent; cost: number }> {
    const correlationId = `intent_${Date.now()}`;
    console.log(`[${correlationId}] Classifying: "${userMessage}"`);

    try {
      const result = await generateObject({
        model: this.model as any,
        schema: SimpleIntentSchema,
                system: `You are an intent classifier for a multimedia platform. Available tools: ${this.availableTools?.join(', ') || ''}.

        CRITICAL: Always extract relevant parameters from the user message:
        - For search requests: ALWAYS include "query" parameter with the search terms
        - For pin requests: include "contentId" if specific ID mentioned, otherwise leave empty for "first/top" resolution
        - For generation requests: extract "prompt", "type", and any model/style references
        - For chat requests: ALWAYS include "message" parameter with the full user message

        Examples:
        - "search for cats" → intent: search, tool: searchUnified, parameters: {query: "cats"}
        - "find me some desert pictures" → intent: search, tool: searchUnified, parameters: {query: "desert pictures"}
        - "pin the first one to canvas" → intent: create, tool: pinToCanvas, parameters: {}
        - "pin item-123 to canvas" → intent: create, tool: pinToCanvas, parameters: {contentId: "item-123"}
        - "make me a picture of a cat" → intent: create, tool: prepareGenerate, parameters: {prompt: "cat", type: "image"}
        - "hello" → intent: chat, tool: chat, parameters: {message: "hello"}

        NEVER return empty parameters object for search. For pin/generate, extract what you can but don't invent IDs.`,
        prompt: userMessage,
        temperature: 0.1
      });

      this.totalCost += 0.001; // Rough estimate

      console.log(`[${correlationId}] Classified as: ${result.object.intent} (${result.object.confidence})`);

      // Add missing fields for compatibility
      const intent: SimpleIntent = {
        ...result.object,
        primary_intent: result.object.intent,
        classification: result.object.intent,
        workflow_steps: [{
          tool_name: result.object.tool_name,
          parameters: {
            ...result.object.parameters,
            ...(context?.userId ? { userId: context.userId } : {}),
            ...(result.object.tool_name === 'chat' ? { message: userMessage } : {}),
            // Ensure search tools always have a query parameter
            ...(result.object.tool_name === 'searchUnified' && !result.object.parameters?.query ? { query: userMessage } : {})
          },
          description: `Execute ${result.object.tool_name} with classified intent`
        }]
      };

      // Generalized chaining: augment with additional steps when requested in natural language
      // 1) generate → rename
      const renameMatch = userMessage.match(/\b(?:rename|name|call)\b.*\b(?:to|as)\s+([\w\-.]+)/i);
      if (renameMatch) {
        const targetName = renameMatch[1];
        intent.workflow_steps!.push({
          tool_name: 'renameAsset',
          parameters: { name: targetName },
          description: 'Plan to rename the generated asset (handled by UI if assetId unknown)'
        });
      }

      // 2) generate image → then make a video (insert intermediate steps for asset materialization)
      const wantsVideo = /\b(make|create|generate)\b.*\b(video|animation|movie|clip)\b/i.test(userMessage)
        || /\bthen\b.*\b(video|animation|movie|clip)\b/i.test(userMessage)
        || /\buse that image to (?:then )?make a video\b/i.test(userMessage);
      if (wantsVideo) {
        intent.workflow_steps!.push({
          tool_name: 'generateContent',
          parameters: { type: 'video', prompt: userMessage },
          description: 'Generate a video based on the described prompt'
        });
      }

      const cost = 0.00001; // Estimated cost for gpt-4o-mini

      return { intent, cost };

    } catch (error) {
      console.error(`[${correlationId}] Classification failed:`, error);

      // Fallback
      const fallbackIntent: SimpleIntent = {
        intent: 'chat',
        confidence: 0.1,
        tool_name: 'chat',
        parameters: { message: userMessage },
        reasoning: 'Failed to classify, defaulting to chat',
        primary_intent: 'chat',
        classification: 'chat',
        workflow_steps: [{
          tool_name: 'chat',
          parameters: { message: userMessage },
          description: 'Fallback chat response'
        }]
      };

      return { intent: fallbackIntent, cost: 0 };
    }
  }

  getCostStats() {
    return { totalCost: this.totalCost };
  }

  resetCostTracking() {
    this.totalCost = 0;
  }
}
