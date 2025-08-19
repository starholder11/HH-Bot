import { openai } from '@ai-sdk/openai';
import { loadPlannerConfig } from '@/services/config/RemoteConfig';
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
  private model = openai('gpt-4o'); // Use more powerful model for better workflow planning
  private totalCost = 0;

  constructor(private llmRouter?: any, private availableTools?: string[]) {
    // Accept optional parameters for compatibility
    this.availableTools = availableTools || [];
  }

  async classifyIntent(userMessage: string, context?: any): Promise<{ intent: SimpleIntent; cost: number }> {
    const correlationId = `intent_${Date.now()}`;
    console.log(`[${correlationId}] Classifying: "${userMessage}"`);

    try {
      // Load planner system prompt from remote config
      const { config: plannerCfg, version: plannerVersion } = await loadPlannerConfig();
      const result = await generateObject({
        model: this.model as any,
        schema: SimpleIntentSchema,
                system: `${plannerCfg.systemPrompt}\n\nAvailable tools: ${this.availableTools?.join(', ') || ''}.

        CRITICAL: Look for compound actions that require MULTIPLE steps in sequence.

        Key patterns to recognize:
        - "find X and pin them" = SEARCH FIRST, then PIN
        - "make X and save it" = GENERATE FIRST, then SAVE
        - "search X and do Y" = SEARCH FIRST, then do Y

        You MUST generate multiple workflow_steps for compound actions. The workflow_steps array should contain ALL steps needed.

                MANDATORY EXAMPLES WITH EXACT PARAMETERS:

        Input: "find four fish related things and pin them to canvas"
        Output: workflow_steps: [
          { tool_name: "searchUnified", parameters: {query: "fish related things"} },
          { tool_name: "pinToCanvas", parameters: {count: 4} }
        ]

        Input: "make me a picture of a cat and save it as fluffy"
        Output: workflow_steps: [
          { tool_name: "prepareGenerate", parameters: {prompt: "cat", type: "image"} },
          { tool_name: "nameImage", parameters: {name: "fluffy"} },
          { tool_name: "saveImage", parameters: {} }
        ]

        Input: "find a couple pictures of mountains and pin them"
        Output: workflow_steps: [
          { tool_name: "searchUnified", parameters: {query: "pictures of mountains"} },
          { tool_name: "pinToCanvas", parameters: {count: 2} }
        ]

        CRITICAL: Extract ALL relevant parameters from the user message:
        - searchUnified needs "query" parameter with search terms - NEVER leave this empty
        - pinToCanvas needs "count" parameter if number specified
        - prepareGenerate needs "prompt" and "type" parameters
        - nameImage needs "name" parameter

        ADDITIONAL MANDATORY PATTERN (for robustness):
        If the user says "make/create/generate ... and name it X" or "name ... X" then you MUST include nameImage with that exact name BEFORE saveImage.
        Example inputs and outputs:
        - Input: "make a picture of a cat and name it toby once it generates"
          Output: workflow_steps: [
            { tool_name: "prepareGenerate", parameters: { prompt: "picture of a cat", type: "image" } },
            { tool_name: "nameImage", parameters: { name: "toby" } },
            { tool_name: "saveImage", parameters: {} }
          ]

        DO NOT generate empty parameters. Extract what the user requested. For searchUnified, ALWAYS extract the search terms from the user message.`,
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
            // Add userId context first
            ...(context?.userId ? { userId: context.userId } : {}),
            // Then add AI-generated parameters (these take precedence)
            ...(step.parameters || {}),
            // Ensure chat tools get the full message
            ...(step.tool_name === 'chat' ? { message: userMessage } : {}),
            // CRITICAL FIX: Ensure searchUnified always has a query parameter
            ...(step.tool_name === 'searchUnified' && !step.parameters?.query ? { query: userMessage } : {})
          }
        }))
      };

      // Post-process: if user requested a name during generation, enforce nameImage before saveImage
      try {
        const lower = userMessage.toLowerCase();
        const nameMatch = lower.match(/name (?:it|this|the)?\s*([\w\-_.]+)/i);
        const mentionsGenerate = /\b(make|create|generate|render|produce|draw|paint)\b/.test(lower);
        if (mentionsGenerate && nameMatch && nameMatch[1]) {
          const requestedName = nameMatch[1];
          const steps = Array.isArray(intent.workflow_steps) ? [...intent.workflow_steps] as any[] : [];
          const hasNameStep = steps.some(s => (s.tool_name || '').toLowerCase() === 'nameimage');
          const saveIndex = steps.findIndex(s => (s.tool_name || '').toLowerCase() === 'saveimage');
          if (!hasNameStep && saveIndex >= 0) {
            const nameStep = { tool_name: 'nameImage', parameters: { name: requestedName, ...(context?.userId ? { userId: context.userId } : {}) } };
            steps.splice(saveIndex, 0, nameStep);
            (intent as any).workflow_steps = steps;
          }
        }
      } catch {}

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
