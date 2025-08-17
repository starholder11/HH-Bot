import { RedisContextService } from '../context/RedisContextService';

export interface ConversationTurn {
  id: string;
  userId: string;
  tenantId: string;
  userMessage: string;
  agentResponse: string;
  intent?: any;
  workflow?: any;
  timestamp: Date;
  correlationId: string;
  status: 'completed' | 'failed' | 'partial' | 'requires_approval';
  feedback?: ConversationFeedback;
}

export interface ConversationFeedback {
  rating: 1 | 2 | 3 | 4 | 5;
  helpful: boolean;
  issues?: string[];
  suggestions?: string;
  timestamp: Date;
}

export interface ConversationHistory {
  userId: string;
  tenantId: string;
  turns: ConversationTurn[];
  totalTurns: number;
  lastActivity: Date;
  preferences?: UserPreferences;
}

export interface UserPreferences {
  preferredResponseStyle: 'concise' | 'detailed' | 'technical';
  defaultApprovalRequired: boolean;
  preferredTemplates: string[];
  communicationPreferences: {
    showProgress: boolean;
    showTechnicalDetails: boolean;
    showCostInfo: boolean;
  };
}

export class ConversationManager {
  private contextService: RedisContextService;
  private conversationHistory: Map<string, ConversationHistory> = new Map();

  constructor(contextService: RedisContextService) {
    this.contextService = contextService;
  }

  /**
   * Start a new conversation turn
   */
  async startConversationTurn(
    userId: string,
    tenantId: string,
    userMessage: string,
    correlationId: string
  ): Promise<ConversationTurn> {
    const turnId = `turn_${correlationId}`;

    const turn: ConversationTurn = {
      id: turnId,
      userId,
      tenantId,
      userMessage,
      agentResponse: '', // Will be filled when response is ready
      timestamp: new Date(),
      correlationId,
      status: 'completed' // Will be updated based on execution
    };

    // Add to conversation history
    await this.addToHistory(userId, tenantId, turn);

    console.log(`[${correlationId}] Started conversation turn: ${turnId}`);
    return turn;
  }

  /**
   * Complete a conversation turn with agent response
   */
  async completeConversationTurn(
    turnId: string,
    agentResponse: string,
    intent?: any,
    workflow?: any,
    status: 'completed' | 'failed' | 'partial' | 'requires_approval' = 'completed'
  ): Promise<void> {
    // Find the turn in history and update it
    for (const history of Array.from(this.conversationHistory.values())) {
      const turn = history.turns.find((t: any) => t.id === turnId);
      if (turn) {
        turn.agentResponse = agentResponse;
        turn.intent = intent;
        turn.workflow = workflow;
        turn.status = status;

        // Update last activity
        history.lastActivity = new Date();

        console.log(`[${turn.correlationId}] Completed conversation turn: ${turnId} (Status: ${status})`);
        return;
      }
    }

    console.warn(`[ConversationManager] Turn not found: ${turnId}`);
  }

  /**
   * Add feedback to a conversation turn
   */
  async addFeedback(
    turnId: string,
    feedback: Omit<ConversationFeedback, 'timestamp'>
  ): Promise<boolean> {
    for (const history of Array.from(this.conversationHistory.values())) {
      const turn = history.turns.find((t: any) => t.id === turnId);
      if (turn) {
        turn.feedback = {
          ...feedback,
          timestamp: new Date()
        };

        console.log(`[${turn.correlationId}] Added feedback to turn: ${turnId} (Rating: ${feedback.rating})`);
        return true;
      }
    }

    return false;
  }

  /**
   * Get conversation history for a user
   */
  async getConversationHistory(
    userId: string,
    tenantId: string,
    limit: number = 10
  ): Promise<ConversationHistory | null> {
    const key = `${userId}:${tenantId}`;
    const history = this.conversationHistory.get(key);

    if (!history) return null;

    // Return limited history
    return {
      ...history,
      turns: history.turns.slice(-limit)
    };
  }

  /**
   * Get recent context for conversation continuity
   */
  async getRecentContext(
    userId: string,
    tenantId: string,
    lookbackTurns: number = 3
  ): Promise<{
    recentTurns: ConversationTurn[];
    commonIntents: string[];
    workflowPatterns: string[];
    userPreferences?: UserPreferences;
  }> {
    const history = await this.getConversationHistory(userId, tenantId, lookbackTurns);

    if (!history) {
      return {
        recentTurns: [],
        commonIntents: [],
        workflowPatterns: []
      };
    }

    // Analyze patterns
    const intents = history.turns
      .filter(t => t.intent?.primary_intent)
      .map(t => t.intent.primary_intent);

    const workflows = history.turns
      .filter(t => t.workflow?.template?.name)
      .map(t => t.workflow.template.name);

    const commonIntents = this.findCommonPatterns(intents);
    const workflowPatterns = this.findCommonPatterns(workflows);

    return {
      recentTurns: history.turns,
      commonIntents,
      workflowPatterns,
      userPreferences: history.preferences
    };
  }

  /**
   * Update user preferences
   */
  async updateUserPreferences(
    userId: string,
    tenantId: string,
    preferences: Partial<UserPreferences>
  ): Promise<void> {
    const key = `${userId}:${tenantId}`;
    let history = this.conversationHistory.get(key);

    if (!history) {
      history = {
        userId,
        tenantId,
        turns: [],
        totalTurns: 0,
        lastActivity: new Date()
      };
      this.conversationHistory.set(key, history);
    }

    const currentPrefs: any = history.preferences || {};
    history.preferences = {
      preferredResponseStyle: preferences.preferredResponseStyle || currentPrefs.preferredResponseStyle || 'concise',
      defaultApprovalRequired: preferences.defaultApprovalRequired ?? currentPrefs.defaultApprovalRequired ?? false,
      preferredTemplates: preferences.preferredTemplates || currentPrefs.preferredTemplates || [],
      communicationPreferences: preferences.communicationPreferences || currentPrefs.communicationPreferences || {}
    } as any;

    console.log(`[ConversationManager] Updated preferences for ${userId}`);
  }

  /**
   * Generate contextual response suggestions
   */
  async generateResponseSuggestions(
    userId: string,
    tenantId: string,
    currentIntent?: string
  ): Promise<string[]> {
    const context = await this.getRecentContext(userId, tenantId);
    const suggestions: string[] = [];

    // Based on recent patterns
    if (context.commonIntents.includes('search')) {
      suggestions.push('Search for more content');
      suggestions.push('Refine the search criteria');
    }

    if (context.workflowPatterns.includes('Create Image Gallery')) {
      suggestions.push('Create another gallery with different theme');
      suggestions.push('Modify the existing gallery');
    }

    // Based on current intent
    if (currentIntent === 'create_canvas') {
      suggestions.push('Add more items to this canvas');
      suggestions.push('Create a layout from this canvas');
      suggestions.push('Share this canvas');
    }

    // Generic helpful suggestions
    if (suggestions.length === 0) {
      suggestions.push('Show me what I can do');
      suggestions.push('Help me organize my content');
      suggestions.push('Create something new');
    }

    return suggestions.slice(0, 4); // Limit to 4 suggestions
  }

  /**
   * Format user-friendly error messages with recovery options
   */
  formatErrorWithRecovery(
    error: any,
    context: {
      userMessage: string;
      attemptedAction: string;
      userId: string;
      tenantId: string;
    }
  ): {
    message: string;
    recoveryOptions: Array<{
      label: string;
      action: string;
      parameters?: any;
    }>;
    suggestions: string[];
  } {
    let message = "I encountered an issue while trying to help you.";
    const recoveryOptions: Array<{ label: string; action: string; parameters?: any }> = [];
    const suggestions: string[] = [];

    // Customize based on error type
    if (error.code === 'NETWORK_ERROR') {
      message = "I'm having trouble connecting to some services right now.";
      recoveryOptions.push({
        label: "Try again",
        action: "retry",
        parameters: { delay: 2000 }
      });
      recoveryOptions.push({
        label: "Try a simpler approach",
        action: "simplify",
        parameters: { useBasicTools: true }
      });
    } else if (error.code === 'INVALID_PARAMETERS') {
      message = "I need a bit more information to help you with that.";
      recoveryOptions.push({
        label: "Let me ask you some questions",
        action: "clarify_parameters"
      });
      recoveryOptions.push({
        label: "Try with default settings",
        action: "use_defaults"
      });
    } else if (error.code === 'RESOURCE_NOT_FOUND') {
      message = "I couldn't find what you're looking for.";
      recoveryOptions.push({
        label: "Search with different terms",
        action: "modify_search",
        parameters: { broaden: true }
      });
      recoveryOptions.push({
        label: "Create something new instead",
        action: "create_alternative"
      });
    }

    // Add contextual suggestions
    if (context.attemptedAction.includes('search')) {
      suggestions.push("Try different keywords");
      suggestions.push("Browse categories instead");
    } else if (context.attemptedAction.includes('create')) {
      suggestions.push("Start with a template");
      suggestions.push("Use existing content");
    }

    return { message, recoveryOptions, suggestions };
  }

  /**
   * Generate progress-aware responses
   */
  generateProgressResponse(
    workflowProgress: {
      currentStep: number;
      totalSteps: number;
      stepName: string;
      status: string;
    },
    userPreferences?: UserPreferences
  ): string {
    const { currentStep, totalSteps, stepName, status } = workflowProgress;
    const showDetails = userPreferences?.communicationPreferences?.showTechnicalDetails !== false;

    if (status === 'running') {
      if (showDetails) {
        return `Working on step ${currentStep} of ${totalSteps}: ${stepName}...`;
      } else {
        return `Processing your request... (${Math.round((currentStep / totalSteps) * 100)}% complete)`;
      }
    } else if (status === 'completed') {
      return `✅ Completed: ${stepName}`;
    } else if (status === 'failed') {
      return `❌ Issue with: ${stepName}`;
    }

    return `${stepName}...`;
  }

  /**
   * Private helper methods
   */
  private async addToHistory(
    userId: string,
    tenantId: string,
    turn: ConversationTurn
  ): Promise<void> {
    const key = `${userId}:${tenantId}`;
    let history = this.conversationHistory.get(key);

    if (!history) {
      history = {
        userId,
        tenantId,
        turns: [],
        totalTurns: 0,
        lastActivity: new Date()
      };
      this.conversationHistory.set(key, history);
    }

    history.turns.push(turn);
    history.totalTurns++;
    history.lastActivity = new Date();

    // Keep only last 50 turns in memory
    if (history.turns.length > 50) {
      history.turns = history.turns.slice(-50);
    }
  }

  private findCommonPatterns(items: string[]): string[] {
    const counts: { [key: string]: number } = {};

    items.forEach(item => {
      counts[item] = (counts[item] || 0) + 1;
    });

    return Object.entries(counts)
      .filter(([_, count]) => count > 1)
      .sort(([_, a], [__, b]) => b - a)
      .map(([item, _]) => item)
      .slice(0, 5);
  }

  /**
   * Get conversation analytics
   */
  getAnalytics(userId?: string, tenantId?: string): {
    totalConversations: number;
    totalTurns: number;
    averageTurnsPerConversation: number;
    successRate: number;
    commonIntents: string[];
    feedbackSummary: {
      averageRating: number;
      totalFeedback: number;
      helpfulPercentage: number;
    };
  } {
    let histories: ConversationHistory[];

    if (userId && tenantId) {
      const history = this.conversationHistory.get(`${userId}:${tenantId}`);
      histories = history ? [history] : [];
    } else {
      histories = Array.from(this.conversationHistory.values());
    }

    const totalConversations = histories.length;
    const totalTurns = histories.reduce((sum, h) => sum + h.totalTurns, 0);
    const averageTurnsPerConversation = totalConversations > 0 ? totalTurns / totalConversations : 0;

    // Calculate success rate
    const allTurns = histories.flatMap(h => h.turns);
    const successfulTurns = allTurns.filter(t => t.status === 'completed').length;
    const successRate = allTurns.length > 0 ? successfulTurns / allTurns.length : 0;

    // Common intents
    const allIntents = allTurns
      .filter(t => t.intent?.primary_intent)
      .map(t => t.intent.primary_intent);
    const commonIntents = this.findCommonPatterns(allIntents);

    // Feedback summary
    const feedbackTurns = allTurns.filter(t => t.feedback);
    const totalFeedback = feedbackTurns.length;
    const averageRating = totalFeedback > 0
      ? feedbackTurns.reduce((sum, t) => sum + t.feedback!.rating, 0) / totalFeedback
      : 0;
    const helpfulCount = feedbackTurns.filter(t => t.feedback!.helpful).length;
    const helpfulPercentage = totalFeedback > 0 ? helpfulCount / totalFeedback : 0;

    return {
      totalConversations,
      totalTurns,
      averageTurnsPerConversation,
      successRate,
      commonIntents,
      feedbackSummary: {
        averageRating,
        totalFeedback,
        helpfulPercentage
      }
    };
  }

  /**
   * Cleanup old conversations
   */
  cleanupOldConversations(olderThanDays: number = 30): number {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    let cleanedCount = 0;

    for (const [key, history] of Array.from(this.conversationHistory.entries())) {
      if (history.lastActivity < cutoff) {
        this.conversationHistory.delete(key);
        cleanedCount++;
      }
    }

    console.log(`[ConversationManager] Cleaned up ${cleanedCount} old conversations`);
    return cleanedCount;
  }
}
