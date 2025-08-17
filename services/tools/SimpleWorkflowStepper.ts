// services/tools/SimpleWorkflowStepper.ts
import { ToolExecutor } from './ToolExecutor';

interface StepResult {
  success: boolean;
  data?: any;
  error?: string;
  correlationId: string;
}

export class SimpleWorkflowStepper {
  constructor(private toolExecutor: ToolExecutor) {}

  async executeMultiStep(
    steps: Array<{tool: string; params: any}>,
    userContext: any,
    correlationId: string
  ): Promise<StepResult[]> {
    const results: StepResult[] = [];
    let stepContext = { ...userContext };

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      console.log(`[${correlationId}] Executing step ${i + 1}/${steps.length}: ${step.tool}`);

      try {
        const result = await this.toolExecutor.executeTool(
          step.tool,
          step.params,
          stepContext
        );

        const stepResult: StepResult = {
          success: result.success !== false,
          data: result,
          correlationId: `${correlationId}_step_${i + 1}`
        };

        results.push(stepResult);

        // Pass result data to next step context
        if (result.success !== false) {
          stepContext = { ...stepContext, [`step_${i}_result`]: result };
          
          // Special handling for common step chains
          if (step.tool === 'searchUnified' && result.results) {
            stepContext.lastSearchResults = result.results;
          }
          if (step.tool === 'prepareGenerate' && result.generatedId) {
            stepContext.lastGeneratedId = result.generatedId;
          }
        }

      } catch (error) {
        console.error(`[${correlationId}] Step ${i + 1} failed:`, error);
        
        const stepResult: StepResult = {
          success: false,
          error: error instanceof Error ? error.message : 'Step failed',
          correlationId: `${correlationId}_step_${i + 1}`
        };
        
        results.push(stepResult);
        
        // Stop on first failure for now
        break;
      }
    }

    return results;
  }

  // Helper: detect common multi-step patterns
  static detectMultiStepIntent(userMessage: string): Array<{tool: string; params: any}> | null {
    const msg = userMessage.toLowerCase();

    // Pattern: generate + rename
    const generateAndRename = /\b(make|create|generate)\b.*\b(rename|name|call)\b.*\b(to|as)\s+([\w\-_.]+)/i;
    const match = userMessage.match(generateAndRename);
    if (match) {
      const targetName = match[4];
      return [
        { tool: 'prepareGenerate', params: { prompt: userMessage, type: 'image' } },
        { tool: 'renameAsset', params: { name: targetName } }
      ];
    }

    // Pattern: search + pin first
    if (/\b(search|find)\b.*\b(pin|save)\b.*\b(first|top|1st)\b/i.test(userMessage)) {
      const queryMatch = userMessage.match(/\b(search|find)\s+(?:me\s+)?([^.!?]+?)(?:\s+(?:and|then)\s+pin)/i);
      const query = queryMatch ? queryMatch[2].trim() : userMessage;
      return [
        { tool: 'searchUnified', params: { query } },
        { tool: 'pinToCanvas', params: {} } // Will resolve from working set
      ];
    }

    return null;
  }
}
