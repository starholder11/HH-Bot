import { ToolExecutor } from '../tools/ToolExecutor';
import { ToolRegistry } from '../tools/ToolRegistry';
import { RedisContextService } from '../context/RedisContextService';
import { QualityController } from '../quality/QualityController';

// Simplified LangGraph-style orchestrator without the complex StateGraph dependencies
// This provides the same functionality but avoids the TypeScript version conflicts

export interface LangGraphWorkflowResult {
  success: boolean;
  finalState: any;
  executionPath: string[];
  totalSteps: number;
  errors: any[];
  qualityScore?: number;
  duration: number;
}

export class LangGraphOrchestrator {
  private toolExecutor: ToolExecutor;
  private toolRegistry: ToolRegistry;
  private contextService: RedisContextService;
  private qualityController: QualityController;
  private workflowStats = {
    totalWorkflows: 0,
    totalSteps: 0,
    totalErrors: 0,
    totalDuration: 0
  };

  constructor(
    toolExecutor: ToolExecutor,
    toolRegistry: ToolRegistry,
    contextService: RedisContextService,
    qualityController: QualityController
  ) {
    this.toolExecutor = toolExecutor;
    this.toolRegistry = toolRegistry;
    this.contextService = contextService;
    this.qualityController = qualityController;
  }

  /**
   * Execute a workflow using LangGraph-style orchestration
   */
  async executeWorkflow(
    userMessage: string,
    userId: string,
    tenantId: string,
    correlationId: string,
    workflowType?: string,
    context?: any
  ): Promise<LangGraphWorkflowResult> {
    const startTime = Date.now();
    console.log(`[${correlationId}] Starting LangGraph-style workflow execution`);

    const executionPath: string[] = [];
    const errors: any[] = [];
    let totalSteps = 0;
    let qualityScore = 0;

    try {
      this.workflowStats.totalWorkflows++;

      // Step 1: Classify Intent
      executionPath.push('classify_intent');
      const intent = await this.classifyIntent(userMessage, context, correlationId);
      totalSteps++;

      // Step 2: Plan Workflow
      executionPath.push('plan_workflow');
      const workflowPlan = await this.planWorkflow(intent, correlationId);
      totalSteps++;

      // Step 3: Execute Tools
      executionPath.push('execute_tools');
      const toolResults = await this.executeTools(workflowPlan, userId, tenantId, correlationId);
      totalSteps += toolResults.length;

      // Step 4: Assess Quality (if tools executed successfully)
      if (toolResults.some(r => r.status === 'completed')) {
        executionPath.push('assess_quality');
        qualityScore = await this.assessQuality(toolResults, correlationId);
        totalSteps++;
      }

      // Step 5: Handle Errors (if any)
      const failedResults = toolResults.filter(r => r.status === 'failed');
      if (failedResults.length > 0) {
        executionPath.push('handle_errors');
        errors.push(...failedResults.map(r => ({ tool: r.toolName, error: r.error })));
        totalSteps++;
      }

      // Step 6: Finalize Response
      executionPath.push('finalize_response');
      const finalMessage = this.finalizeResponse(toolResults, errors, qualityScore);
      totalSteps++;

      const duration = Date.now() - startTime;
      this.workflowStats.totalSteps += totalSteps;
      this.workflowStats.totalErrors += errors.length;
      this.workflowStats.totalDuration += duration;

      console.log(`[${correlationId}] LangGraph-style workflow completed in ${duration}ms`);

      return {
        success: errors.length === 0,
        finalState: {
          messages: [
            { role: 'user', content: userMessage },
            { role: 'assistant', content: finalMessage }
          ],
          intent,
          toolResults,
          qualityScore,
          executionPath
        },
        executionPath,
        totalSteps,
        errors,
        qualityScore,
        duration
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[${correlationId}] LangGraph-style workflow failed:`, error);

      return {
        success: false,
        finalState: {
          messages: [
            { role: 'user', content: userMessage },
            { role: 'assistant', content: 'Workflow execution failed' }
          ],
          error: error instanceof Error ? error.message : 'Unknown error'
        },
        executionPath: [...executionPath, 'error'],
        totalSteps,
        errors: [error],
        duration
      };
    }
  }

  private async classifyIntent(userMessage: string, context: any, correlationId: string): Promise<any> {
    console.log(`[${correlationId}] LangGraph: Classifying intent`);

    // Simple intent classification based on keywords
    const message = userMessage.toLowerCase();

    if (message.includes('search') || message.includes('find')) {
      return {
        primary_intent: 'search_content',
        confidence: 0.8,
        workflow_steps: [
          { tool_name: 'searchUnified', parameters: { query: userMessage } }
        ]
      };
    } else if (message.includes('create') || message.includes('generate') || message.includes('make')) {
      return {
        primary_intent: 'create_content',
        confidence: 0.8,
        workflow_steps: [
          { tool_name: 'generateImage', parameters: { prompt: userMessage } }
        ]
      };
    } else if (message.includes('gallery') || message.includes('collection')) {
      return {
        primary_intent: 'create_gallery',
        confidence: 0.9,
        workflow_steps: [
          { tool_name: 'searchUnified', parameters: { query: userMessage } },
          { tool_name: 'createCanvas', parameters: { name: 'Auto Gallery', description: userMessage } },
          { tool_name: 'pinToCanvas', parameters: { items: '{{searchResults}}' } }
        ]
      };
    } else {
      return {
        primary_intent: 'general_chat',
        confidence: 0.5,
        workflow_steps: []
      };
    }
  }

  private async planWorkflow(intent: any, correlationId: string): Promise<any[]> {
    console.log(`[${correlationId}] LangGraph: Planning workflow`);

    if (!intent.workflow_steps || intent.workflow_steps.length === 0) {
      return [];
    }

    // Validate that all tools exist
    const availableTools = this.toolRegistry.getAllTools();
    const toolNames = availableTools.map(t => t.name);

    return intent.workflow_steps.filter((step: any) => {
      if (!toolNames.includes(step.tool_name)) {
        console.warn(`[${correlationId}] Tool not found: ${step.tool_name}`);
        return false;
      }
      return true;
    });
  }

  private async executeTools(workflowPlan: any[], userId: string, tenantId: string, correlationId: string): Promise<any[]> {
    console.log(`[${correlationId}] LangGraph: Executing ${workflowPlan.length} tools`);

    const results: any[] = [];

    for (let i = 0; i < workflowPlan.length; i++) {
      const step = workflowPlan[i];

      try {
        console.log(`[${correlationId}] Executing step ${i + 1}/${workflowPlan.length}: ${step.tool_name}`);

        // Resolve parameters with previous results
        const resolvedParams: any = this.resolveParameters(step.parameters, results) || {};

        // FALLBACK: Extract missing parameters from AI-generated descriptions when parameters are empty or incomplete
        try {
          const desc: string = typeof step.description === 'string' ? step.description : '';
          const toolName = (step.tool_name || '').toLowerCase();
          const hasEssentials = Object.keys(resolvedParams).length > 0;

          if (desc && !hasEssentials) {
            if (toolName === 'preparegenerate') {
              // prompt '...'
              const promptMatch = desc.match(/prompt '\s*([^']+?)\s*'/i);
              if (promptMatch && promptMatch[1]) {
                resolvedParams.prompt = promptMatch[1];
              }
              // type 'image' | 'video' | 'audio'
              const typeMatch = desc.match(/type '\s*(image|video|audio)\s*'/i);
              if (typeMatch && typeMatch[1]) {
                resolvedParams.type = typeMatch[1].toLowerCase();
              }
              if (!resolvedParams.type) {
                // Heuristic default
                resolvedParams.type = /video/i.test(desc) ? 'video' : (/audio/i.test(desc) ? 'audio' : 'image');
              }
              console.log(`[${correlationId}] Orchestrator: Extracted from description ->`, JSON.stringify(resolvedParams));
            } else if (toolName === 'nameimage' || toolName === 'renameasset') {
              const nameMatch = desc.match(/'([^']+)'/);
              if (nameMatch && nameMatch[1]) {
                resolvedParams.name = nameMatch[1];
                console.log(`[${correlationId}] Orchestrator: Extracted name from description -> ${resolvedParams.name}`);
              }
            } else if (toolName === 'pintocanvas' || toolName === 'pin') {
              // Extract count if present
              const countMatch = desc.match(/\b(\d{1,2})\b/);
              if (countMatch) {
                const n = parseInt(countMatch[1], 10);
                if (!Number.isNaN(n) && n > 0) resolvedParams.count = n;
              }
            }
          }
        } catch (e) {
          console.warn(`[${correlationId}] Orchestrator: Parameter extraction fallback failed:`, e);
        }

        const toolResult = await this.toolExecutor.executeTool(
          step.tool_name,
          { ...resolvedParams, userId, tenantId },
          { userId, tenantId }
        );

        results.push(toolResult);

        // Side-effect: if this was a save step and the user asked to pin, enqueue a synthetic pinToCanvas plan item
        try {
          const original = (workflow as any)?.intent?.parameters?.message || '';
          if ((step.tool_name || '').toLowerCase() === 'saveimage' && /\bpin\b/i.test(original)) {
            workflowPlan.push({ tool_name: 'pinToCanvas', parameters: { count: 1 } });
            console.log(`[${correlationId}] LangGraph: Added synthetic pinToCanvas after save due to pin intent`);
          }
        } catch {}

      } catch (error) {
        console.error(`[${correlationId}] Tool execution failed for ${step.tool_name}:`, error);
        results.push({
          toolName: step.tool_name,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
          duration: 0
        });
      }
    }

    return results;
  }

  private async assessQuality(toolResults: any[], correlationId: string): Promise<number> {
    console.log(`[${correlationId}] LangGraph: Assessing quality`);

    try {
      // Use QualityController per spec instead of naive success rate
      const assessment = await this.qualityController.assessQuality(
        'workflow',
        `workflow_${correlationId}`,
        { toolResults },
        // Derive from last tool result if present
        (toolResults.length > 0 && toolResults[toolResults.length - 1].userId) ? toolResults[toolResults.length - 1].userId : 'unknown',
        (toolResults.length > 0 && toolResults[toolResults.length - 1].tenantId) ? toolResults[toolResults.length - 1].tenantId : 'default',
        correlationId
      );
      return assessment.overallScore;
    } catch (error) {
      console.error(`[${correlationId}] Quality assessment failed:`, error);
      return 0;
    }
  }

  private finalizeResponse(toolResults: any[], errors: any[], qualityScore: number): string {
    const successfulResults = toolResults.filter(r => r.status === 'completed');

    if (errors.length > 0 && successfulResults.length === 0) {
      return "I encountered errors while processing your request. Please try again or contact support.";
    } else if (errors.length > 0) {
      return `I partially completed your request. ${successfulResults.length} operations succeeded, but ${errors.length} encountered issues.`;
    } else if (successfulResults.length > 0) {
      return `Successfully completed your request with ${successfulResults.length} operations. Quality score: ${qualityScore.toFixed(2)}/1.0`;
    } else {
      return "I understand your request. How can I help you further?";
    }
  }

  private resolveParameters(params: any, previousResults: any[]): any {
    if (typeof params === 'string') {
      // Simple parameter resolution - replace {{searchResults}} with actual results
      if (params === '{{searchResults}}' && previousResults.length > 0) {
        const searchResult = previousResults.find(r => r.toolName === 'searchUnified');
        return searchResult?.result?.results || [];
      }
      return params;
    }

    if (Array.isArray(params)) {
      return params.map(item => this.resolveParameters(item, previousResults));
    }

    if (typeof params === 'object' && params !== null) {
      const resolved: any = {};
      for (const [key, value] of Object.entries(params)) {
        resolved[key] = this.resolveParameters(value, previousResults);
      }
      return resolved;
    }

    return params;
  }

  /**
   * Get workflow statistics
   */
  getWorkflowStats(): {
    totalWorkflows: number;
    averageSteps: number;
    successRate: number;
    averageQualityScore: number;
  } {
    const averageSteps = this.workflowStats.totalWorkflows > 0
      ? this.workflowStats.totalSteps / this.workflowStats.totalWorkflows
      : 0;

    const successRate = this.workflowStats.totalWorkflows > 0
      ? (this.workflowStats.totalWorkflows - this.workflowStats.totalErrors) / this.workflowStats.totalWorkflows
      : 0;

    return {
      totalWorkflows: this.workflowStats.totalWorkflows,
      averageSteps: Math.round(averageSteps * 100) / 100,
      successRate: Math.round(successRate * 100) / 100,
      averageQualityScore: 0.85 // Placeholder - would be calculated from actual quality assessments
    };
  }
}
