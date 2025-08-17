import { RedisContextService } from '../context/RedisContextService';

export interface ToolError {
  code: string;
  message: string;
  details?: any;
  recoveryOptions?: RecoveryOption[];
  correlationId?: string;
}

export interface RecoveryOption {
  id: string;
  description: string;
  action: 'retry' | 'modify_params' | 'alternative_tool' | 'skip_step' | 'manual_intervention';
  parameters?: any;
  estimatedSuccess?: number; // 0-1 probability
}

export interface WorkflowCheckpoint {
  id: string;
  workflowId: string;
  stepIndex: number;
  completedSteps: any[];
  remainingSteps: any[];
  context: any;
  timestamp: Date;
}

export class EnhancedErrorHandler {
  private contextService: RedisContextService;
  private checkpoints: Map<string, WorkflowCheckpoint[]> = new Map();

  constructor(contextService: RedisContextService) {
    this.contextService = contextService;
  }

  /**
   * Create a comprehensive error with recovery options
   */
  createToolError(
    code: string,
    message: string,
    details: any,
    toolName: string,
    parameters: any,
    correlationId: string
  ): ToolError {
    const recoveryOptions = this.generateRecoveryOptions(code, toolName, parameters, details);

    return {
      code,
      message,
      details,
      recoveryOptions,
      correlationId
    };
  }

  /**
   * Generate contextual recovery options based on error type
   */
  private generateRecoveryOptions(
    errorCode: string,
    toolName: string,
    parameters: any,
    details: any
  ): RecoveryOption[] {
    const options: RecoveryOption[] = [];

    switch (errorCode) {
      case 'NETWORK_ERROR':
      case 'TIMEOUT':
        options.push({
          id: 'retry_with_backoff',
          description: 'Retry the operation with exponential backoff',
          action: 'retry',
          estimatedSuccess: 0.7
        });
        break;

      case 'INVALID_PARAMETERS':
        options.push({
          id: 'fix_parameters',
          description: 'Modify parameters based on validation errors',
          action: 'modify_params',
          parameters: this.suggestParameterFixes(details.validationErrors),
          estimatedSuccess: 0.8
        });
        break;

      case 'RESOURCE_NOT_FOUND':
        if (toolName === 'searchUnified') {
          options.push({
            id: 'broaden_search',
            description: 'Try a broader search with different keywords',
            action: 'modify_params',
            parameters: { query: this.broadenSearchQuery(parameters.query) },
            estimatedSuccess: 0.6
          });
        }
        options.push({
          id: 'skip_step',
          description: 'Skip this step and continue with workflow',
          action: 'skip_step',
          estimatedSuccess: 0.5
        });
        break;

      case 'RATE_LIMIT_EXCEEDED':
        options.push({
          id: 'wait_and_retry',
          description: 'Wait for rate limit reset and retry',
          action: 'retry',
          parameters: { delay: 60000 }, // 1 minute
          estimatedSuccess: 0.9
        });
        options.push({
          id: 'use_alternative',
          description: 'Use alternative tool or approach',
          action: 'alternative_tool',
          parameters: this.suggestAlternativeTool(toolName),
          estimatedSuccess: 0.6
        });
        break;

      case 'INSUFFICIENT_PERMISSIONS':
        options.push({
          id: 'manual_intervention',
          description: 'Manual intervention required - check permissions',
          action: 'manual_intervention',
          estimatedSuccess: 0.3
        });
        break;

      default:
        // Generic recovery options
        options.push({
          id: 'retry_once',
          description: 'Retry the operation once',
          action: 'retry',
          estimatedSuccess: 0.4
        });
        options.push({
          id: 'skip_and_continue',
          description: 'Skip this step and continue',
          action: 'skip_step',
          estimatedSuccess: 0.3
        });
    }

    return options;
  }

  /**
   * Create workflow checkpoint for resuming after failures
   */
  async createCheckpoint(
    workflowId: string,
    stepIndex: number,
    completedSteps: any[],
    remainingSteps: any[],
    context: any,
    correlationId: string
  ): Promise<string> {
    const checkpointId = `checkpoint_${workflowId}_${stepIndex}_${Date.now()}`;

    const checkpoint: WorkflowCheckpoint = {
      id: checkpointId,
      workflowId,
      stepIndex,
      completedSteps: [...completedSteps],
      remainingSteps: [...remainingSteps],
      context: { ...context },
      timestamp: new Date()
    };

    // Store in memory (could be Redis for persistence)
    if (!this.checkpoints.has(workflowId)) {
      this.checkpoints.set(workflowId, []);
    }
    this.checkpoints.get(workflowId)!.push(checkpoint);

    // Keep only last 5 checkpoints per workflow
    const checkpoints = this.checkpoints.get(workflowId)!;
    if (checkpoints.length > 5) {
      checkpoints.splice(0, checkpoints.length - 5);
    }

    console.log(`[${correlationId}] Created workflow checkpoint: ${checkpointId}`);
    return checkpointId;
  }

  /**
   * Resume workflow from checkpoint
   */
  async resumeFromCheckpoint(
    workflowId: string,
    checkpointId?: string,
    correlationId?: string
  ): Promise<WorkflowCheckpoint | null> {
    const checkpoints = this.checkpoints.get(workflowId);
    if (!checkpoints || checkpoints.length === 0) {
      return null;
    }

    let checkpoint: WorkflowCheckpoint;
    if (checkpointId) {
      const found = checkpoints.find(cp => cp.id === checkpointId);
      if (!found) return null;
      checkpoint = found;
    } else {
      // Get latest checkpoint
      checkpoint = checkpoints[checkpoints.length - 1];
    }

    console.log(`[${correlationId}] Resuming workflow from checkpoint: ${checkpoint.id}`);
    return checkpoint;
  }

  /**
   * Get all checkpoints for a workflow
   */
  getWorkflowCheckpoints(workflowId: string): WorkflowCheckpoint[] {
    return this.checkpoints.get(workflowId) || [];
  }

  /**
   * Clean up old checkpoints
   */
  cleanupCheckpoints(olderThanHours: number = 24) {
    const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);

    for (const [workflowId, checkpoints] of Array.from(this.checkpoints.entries())) {
      const filtered = checkpoints.filter((cp: WorkflowCheckpoint) => cp.timestamp > cutoff);
      if (filtered.length === 0) {
        this.checkpoints.delete(workflowId);
      } else {
        this.checkpoints.set(workflowId, filtered);
      }
    }
  }

  /**
   * Helper methods for generating recovery suggestions
   */
  private suggestParameterFixes(validationErrors: any[]): any {
    const fixes: any = {};

    for (const error of validationErrors) {
      switch (error.field) {
        case 'query':
          if (error.code === 'TOO_SHORT') {
            fixes.query = error.value + ' creative art';
          } else if (error.code === 'INVALID_CHARACTERS') {
            fixes.query = error.value.replace(/[^a-zA-Z0-9\s]/g, '');
          }
          break;
        case 'limit':
          if (error.code === 'OUT_OF_RANGE') {
            fixes.limit = Math.min(Math.max(error.value, 1), 50);
          }
          break;
        case 'canvasId':
          if (error.code === 'INVALID_FORMAT') {
            fixes.canvasId = null; // Let system create new canvas
          }
          break;
      }
    }

    return fixes;
  }

  private broadenSearchQuery(originalQuery: string): string {
    // Simple query broadening logic
    const words = originalQuery.split(' ');
    if (words.length > 2) {
      // Remove most specific word (usually last)
      return words.slice(0, -1).join(' ');
    } else if (words.length === 2) {
      // Keep only first word
      return words[0];
    } else {
      // Add generic terms
      return originalQuery + ' art creative';
    }
  }

  private suggestAlternativeTool(toolName: string): any {
    const alternatives: { [key: string]: string } = {
      'searchUnified': 'searchByCategory',
      'generateImage': 'generateVideo',
      'pinToCanvas': 'createNewCanvas',
      'uploadFile': 'importFromUrl'
    };

    return { alternativeTool: alternatives[toolName] || null };
  }

  /**
   * Format error for user display
   */
  formatUserError(error: ToolError): string {
    let message = `❌ **${error.message}**\n\n`;

    if (error.recoveryOptions && error.recoveryOptions.length > 0) {
      message += "**Recovery Options:**\n";
      error.recoveryOptions.forEach((option, index) => {
        const confidence = option.estimatedSuccess
          ? ` (${Math.round(option.estimatedSuccess * 100)}% success rate)`
          : '';
        message += `${index + 1}. ${option.description}${confidence}\n`;
      });
    }

    if (error.correlationId) {
      message += `\n*Reference ID: ${error.correlationId}*`;
    }

    return message;
  }
}
