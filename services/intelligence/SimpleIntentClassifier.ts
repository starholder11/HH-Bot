import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';

// Simplified intent schema for testing
export const SimpleIntentSchema = z.object({
  intent: z.enum(['search', 'create', 'update', 'chat']).describe('Primary user intent'),
  confidence: z.number().min(0).max(1).describe('Confidence score'),
  tool_name: z.string().describe('Recommended tool to use'),
  parameters: z.record(z.any()).describe('Parameters for the tool'),
  reasoning: z.string().describe('Why this classification was chosen'),
  primary_intent: z.string().optional().describe('Primary intent string'),
  classification: z.string().optional().describe('Classification string'),
  workflow_steps: z.array(z.object({
    tool_name: z.string(),
    parameters: z.record(z.any()),
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
        Always include userId if provided in context.
        Examples:
        - "search for cats" → intent: search, tool: searchUnified, parameters: {query: "cats"}
        - "create a canvas" → intent: create, tool: createCanvas, parameters: {name: "New Canvas"}
        - "hello" → intent: chat, tool: chat, parameters: {message: "hello"}`,
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
          parameters: { ...result.object.parameters, ...(context?.userId ? { userId: context.userId } : {}) },
          description: `Execute ${result.object.tool_name} with classified intent`
        }]
      };

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
