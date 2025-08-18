import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';

// AI-driven workflow planning schema
export const SimpleIntentSchema = z.object({
  intent: z.enum(['search', 'create', 'update', 'chat']).describe('Primary user intent'),
  confidence: z.number().min(0).max(1).describe('Confidence score'),
  tool_name: z.string().describe('Primary tool (for compatibility)'),
  parameters: z.record(z.any()).optional().default({}).describe('Primary tool parameters (for compatibility)'),
  reasoning: z.string().describe('Why this classification and workflow was chosen'),
  primary_intent: z.string().optional().describe('Primary intent string'),
  classification: z.string().optional().describe('Classification string'),
  workflow_steps: z.array(z.object({
    tool_name: z.string(),
    parameters: z.record(z.any()).optional().default({}),
    description: z.string().optional()
  })).describe('Complete workflow steps to execute - ALWAYS populate this with the full sequence needed')
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
                system: `You are an AI workflow planner for a multimedia platform. Available tools: ${this.availableTools?.join(', ') || ''}.

        CRITICAL INSTRUCTION: You MUST plan multi-step workflows when users request compound actions.

        When a user says "find X and pin them", you need TWO steps:
        1. searchUnified to find the content
        2. pinToCanvas to pin the results

        When a user says "make X and save it as Y", you need THREE steps:
        1. prepareGenerate to create the content
        2. nameImage to name it
        3. saveImage to save it

        ALWAYS break down compound requests into multiple workflow_steps. Never generate just one step for compound actions.

        Examples of CORRECT multi-step planning:
        - "find four fish related things and pin them to canvas" → workflow_steps: [
            { tool_name: "searchUnified", parameters: {query: "fish related things"} },
            { tool_name: "pinToCanvas", parameters: {count: 4} }
          ]
        - "make me a picture of a cat and save it as fluffy" → workflow_steps: [
            { tool_name: "prepareGenerate", parameters: {prompt: "cat", type: "image"} },
            { tool_name: "nameImage", parameters: {name: "fluffy"} },
            { tool_name: "saveImage", parameters: {} }
          ]
        - "search for cats and pin the first one" → workflow_steps: [
            { tool_name: "searchUnified", parameters: {query: "cats"} },
            { tool_name: "pinToCanvas", parameters: {count: 1} }
          ]

        For single actions, use one step:
        - "search for cats" → workflow_steps: [{ tool_name: "searchUnified", parameters: {query: "cats"} }]

        Analyze the user request carefully and generate ALL steps needed to complete their request.`,
        prompt: userMessage,
        temperature: 0.1
      });

      this.totalCost += 0.001; // Rough estimate

      console.log(`[${correlationId}] Classified as: ${result.object.intent} (${result.object.confidence})`);

      // Use AI-generated workflow steps directly - no more hardcoded patterns!
      const intent: SimpleIntent = {
        ...result.object,
        primary_intent: result.object.intent,
        classification: result.object.intent,
        // Use the AI-generated workflow_steps as-is, with userId context added
        workflow_steps: (result.object.workflow_steps || []).map(step => ({
          ...step,
          parameters: {
            ...step.parameters,
            ...(context?.userId ? { userId: context.userId } : {}),
            // Ensure chat tools get the full message
            ...(step.tool_name === 'chat' ? { message: userMessage } : {})
          }
        }))
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
