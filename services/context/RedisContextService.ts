import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';

export interface UserContext {
  userId: string;
  tenantId: string;
  sessionId: string;
  activeProjects: Array<{
    id: string;
    name: string;
    type: string;
    updatedAt: string;
  }>;
  recentSearches: string[];
  canvasItems: Array<{
    id: string;
    canvasId: string;
    contentId: string;
    position: { x: number; y: number };
    addedAt: string;
  }>;
  preferences: UserPreferences;
  sessionHistory: Array<{
    timestamp: string;
    eventType: string;
    data: Record<string, any>;
    workflowId?: string;
  }>;
  lastActivity: string;
}

export interface UserPreferences {
  qualityLevel: 'draft' | 'standard' | 'high' | 'premium';
  preferredStyles: string[];
  defaultProjectSettings: Record<string, any>;
  notificationSettings: Record<string, boolean>;
  workflowTemplates: string[];
}

export interface WorkflowState {
  executionId: string;
  tenantId: string;
  userId: string;
  correlationId: string;
  workflowType: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'paused';
  currentStep: string;
  context: Record<string, any>;
  results: Record<string, any>;
  errors: Array<{
    step: string;
    error: string;
    timestamp: string;
    correlationId: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export class RedisContextService {
  private redis: Redis;
  private readonly CONTEXT_TTL = 24 * 60 * 60; // 24 hours
  private readonly WORKFLOW_TTL = 7 * 24 * 60 * 60; // 7 days
  private readonly SESSION_HISTORY_LIMIT = 100;
  private readonly RECENT_SEARCHES_LIMIT = 20;

  constructor(redisUrl?: string) {
    this.redis = new Redis(redisUrl || process.env.REDIS_URL || 'redis://localhost:6379');

    this.redis.on('connect', () => {
      console.log('Redis connected successfully');
    });

    this.redis.on('error', (error) => {
      console.error('Redis connection error:', error);
    });
  }

  /**
   * Generate a new correlation ID for request tracing
   */
  generateCorrelationId(): string {
    return `corr_${Date.now()}_${uuidv4().slice(0, 8)}`;
  }

  /**
   * Get user context from Redis
   */
  async getUserContext(userId: string, tenantId: string): Promise<UserContext | null> {
    const key = this.getUserContextKey(tenantId, userId);

    try {
      const data = await this.redis.get(key);

      if (!data) {
        // Create default context for new users
        const defaultContext = this.createDefaultUserContext(userId, tenantId);
        await this.updateUserContext(defaultContext);
        return defaultContext;
      }

      const context = JSON.parse(data) as UserContext;

      // Update last activity
      context.lastActivity = new Date().toISOString();
      await this.updateUserContext(context);

      return context;
    } catch (error) {
      console.error('Error getting user context:', error);
      return null;
    }
  }

  /**
   * Update user context in Redis
   */
  async updateUserContext(context: UserContext): Promise<void> {
    const key = this.getUserContextKey(context.tenantId, context.userId);
    context.lastActivity = new Date().toISOString();

    // Trim arrays to prevent memory bloat
    context.recentSearches = context.recentSearches.slice(0, this.RECENT_SEARCHES_LIMIT);
    context.sessionHistory = context.sessionHistory.slice(0, this.SESSION_HISTORY_LIMIT);

    try {
      await this.redis.setex(key, this.CONTEXT_TTL, JSON.stringify(context));
    } catch (error) {
      console.error('Error updating user context:', error);
      throw error;
    }
  }

  /**
   * Update user context with userId, tenantId, and updates (overloaded method)
   */
  async updateUserContextWithParams(userId: string, tenantId: string, updates: Partial<UserContext>): Promise<void> {
    const existingContext = await this.getUserContext(userId, tenantId);
    const context: UserContext = {
      ...existingContext,
      ...updates,
      userId,
      tenantId
    } as UserContext;

    await this.updateUserContext(context);
  }

  /**
   * Add a search query to user's recent searches
   */
  async addRecentSearch(userId: string, tenantIdOrQuery: string, query?: string): Promise<void> {
    // Handle both old (2 params) and new (3 params) signatures
    const actualTenantId = query ? tenantIdOrQuery : 'default';
    const actualQuery = query || tenantIdOrQuery;
    console.log(`Adding recent search: ${actualQuery} for user: ${userId}`);
    const context = await this.getUserContext(userId, actualTenantId);
    if (!context) {
      console.log('No context found for user');
      return;
    }

    console.log('Before update - recent searches:', context.recentSearches);

    // Remove duplicate if exists and add to front
    context.recentSearches = context.recentSearches.filter(s => s !== actualQuery);
    context.recentSearches.unshift(actualQuery);

    console.log('After update - recent searches:', context.recentSearches);

    await this.updateUserContext(context);

    console.log('Context updated successfully');
  }

  /**
   * Record a session event
   */
  async recordSessionEvent(
    userId: string,
    tenantId: string,
    eventType: string,
    data: Record<string, any>,
    workflowId?: string
  ): Promise<void> {
    const context = await this.getUserContext(userId, tenantId);
    if (!context) return;

    const event = {
      timestamp: new Date().toISOString(),
      eventType,
      data,
      workflowId
    };

    context.sessionHistory.unshift(event);
    await this.updateUserContext(context);
  }

  /**
   * Get workflow state from Redis
   */
  async getWorkflowState(executionId: string): Promise<WorkflowState | null> {
    const key = this.getWorkflowKey(executionId);

    try {
      const data = await this.redis.get(key);
      return data ? JSON.parse(data) as WorkflowState : null;
    } catch (error) {
      console.error('Error getting workflow state:', error);
      return null;
    }
  }

  /**
   * Update workflow state in Redis
   */
  async updateWorkflowState(state: WorkflowState): Promise<void> {
    const key = this.getWorkflowKey(state.executionId);
    state.updatedAt = new Date().toISOString();

    try {
      await this.redis.setex(key, this.WORKFLOW_TTL, JSON.stringify(state));
    } catch (error) {
      console.error('Error updating workflow state:', error);
      throw error;
    }
  }

  /**
   * Create a new workflow state
   */
  async createWorkflowState(
    userId: string,
    tenantId: string,
    workflowType: string,
    correlationId: string,
    initialContext: Record<string, any> = {}
  ): Promise<WorkflowState> {
    const executionId = `workflow_${Date.now()}_${uuidv4().slice(0, 8)}`;

    const state: WorkflowState = {
      executionId,
      tenantId,
      userId,
      correlationId,
      workflowType,
      status: 'pending',
      currentStep: 'initialized',
      context: initialContext,
      results: {},
      errors: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await this.updateWorkflowState(state);
    return state;
  }

  /**
   * Get all active workflows for a user
   */
  async getUserActiveWorkflows(userId: string, tenantId: string): Promise<WorkflowState[]> {
    const pattern = `workflow:*`;
    const keys = await this.redis.keys(pattern);

    const workflows: WorkflowState[] = [];

    for (const key of keys) {
      try {
        const data = await this.redis.get(key);
        if (data) {
          const workflow = JSON.parse(data) as WorkflowState;
          if (workflow.userId === userId &&
              workflow.tenantId === tenantId &&
              ['pending', 'running', 'paused'].includes(workflow.status)) {
            workflows.push(workflow);
          }
        }
      } catch (error) {
        console.error('Error parsing workflow data:', error);
      }
    }

    return workflows.sort((a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  /**
   * Clean up expired contexts and workflows
   */
  async cleanup(): Promise<void> {
    console.log('Running Redis cleanup...');

    // This would typically be handled by Redis TTL, but we can add manual cleanup if needed
    const contextPattern = 'context:*';
    const workflowPattern = 'workflow:*';

    // Could implement manual cleanup logic here if needed
    console.log('Redis cleanup completed');
  }

  /**
   * Get Redis health status
   */
  async getHealthStatus(): Promise<{ status: string; details: any }> {
    try {
      const info = await this.redis.info();
      const keyCount = await this.redis.dbsize();

      return {
        status: 'healthy',
        details: {
          connected: true,
          keyCount,
          memory: info.includes('used_memory_human') ?
            info.split('used_memory_human:')[1].split('\r\n')[0] : 'unknown'
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      };
    }
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    await this.redis.quit();
  }

  // Private helper methods

  private getUserContextKey(tenantId: string, userId: string): string {
    return `context:${tenantId}:${userId}`;
  }

  private getWorkflowKey(executionId: string): string {
    return `workflow:${executionId}`;
  }

  private createDefaultUserContext(userId: string, tenantId: string): UserContext {
    return {
      userId,
      tenantId,
      sessionId: uuidv4(),
      activeProjects: [],
      recentSearches: [],
      canvasItems: [],
      preferences: {
        qualityLevel: 'standard',
        preferredStyles: [],
        defaultProjectSettings: {},
        notificationSettings: {
          workflowComplete: true,
          qualityIssues: true,
          collaborationUpdates: false
        },
        workflowTemplates: []
      },
      sessionHistory: [],
      lastActivity: new Date().toISOString()
    };
  }

  async checkHealth(): Promise<{ status: string; details: any }> {
    try {
      const ping = await this.redis.ping();
      const info = await this.redis.info('memory');
      const dbSize = await this.redis.dbsize();

      const memoryMatch = info.match(/used_memory_human:([0-9.]+)([KMGT]?)/);
      const memory = memoryMatch ? `${memoryMatch[1]}${memoryMatch[2]}` : 'N/A';

      return {
        status: ping === 'PONG' ? 'healthy' : 'unhealthy',
        details: {
          connected: true,
          keyCount: dbSize,
          memory: memory
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          connected: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }
}
