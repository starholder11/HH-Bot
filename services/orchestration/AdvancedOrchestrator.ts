import { RedisContextService } from '../context/RedisContextService';
import { ToolExecutor } from '../tools/ToolExecutor';
import { QualityController } from '../quality/QualityController';
import { ConversationManager } from '../ux/ConversationManager';

export interface WorkflowOptimization {
  id: string;
  workflowType: string;
  optimizations: OptimizationRule[];
  performance: {
    averageExecutionTime: number;
    successRate: number;
    qualityScore: number;
    userSatisfaction: number;
  };
  lastUpdated: Date;
}

export interface OptimizationRule {
  id: string;
  name: string;
  description: string;
  condition: string; // JSON logic condition
  action: 'parallel_execution' | 'cache_result' | 'skip_step' | 'use_alternative' | 'batch_operations';
  parameters: any;
  impact: {
    timeReduction: number; // percentage
    qualityImpact: number; // -1 to 1
    costReduction: number; // percentage
  };
}

export interface ContextPattern {
  id: string;
  userId: string;
  tenantId: string;
  pattern: {
    intents: string[];
    workflows: string[];
    timeOfDay?: string;
    frequency: number;
  };
  predictions: {
    nextLikelyIntent: string;
    confidence: number;
    suggestedPreparation: string[];
  };
  lastSeen: Date;
}

export interface WorkflowCache {
  key: string;
  workflowType: string;
  parameters: any;
  result: any;
  qualityScore: number;
  expiresAt: Date;
  hitCount: number;
  lastUsed: Date;
}

export class AdvancedOrchestrator {
  private contextService: RedisContextService;
  private toolExecutor: ToolExecutor;
  private qualityController: QualityController;
  private conversationManager: ConversationManager;

  private optimizations: Map<string, WorkflowOptimization> = new Map();
  private contextPatterns: Map<string, ContextPattern[]> = new Map();
  private workflowCache: Map<string, WorkflowCache> = new Map();
  private performanceMetrics: Map<string, any[]> = new Map();

  constructor(
    contextService: RedisContextService,
    toolExecutor: ToolExecutor,
    qualityController: QualityController,
    conversationManager: ConversationManager
  ) {
    this.contextService = contextService;
    this.toolExecutor = toolExecutor;
    this.qualityController = qualityController;
    this.conversationManager = conversationManager;

    this.initializeOptimizations();

    // Start background optimization learning
    setInterval(() => {
      this.learnFromPerformanceData();
    }, 300000); // Every 5 minutes

    // Cache cleanup
    setInterval(() => {
      this.cleanupCache();
    }, 600000); // Every 10 minutes
  }

  private initializeOptimizations() {
    const optimizations: WorkflowOptimization[] = [
      {
        id: 'search-and-create',
        workflowType: 'search_create_canvas',
        optimizations: [
          {
            id: 'parallel_search_canvas',
            name: 'Parallel Search and Canvas Creation',
            description: 'Create canvas while search is running',
            condition: '{"and": [{">=": [{"var": "searchResultCount"}, 1]}, {"==": [{"var": "canvasName"}, null]}]}',
            action: 'parallel_execution',
            parameters: {
              parallelSteps: ['search', 'createCanvas']
            },
            impact: {
              timeReduction: 30,
              qualityImpact: 0,
              costReduction: 0
            }
          },
          {
            id: 'cache_search_results',
            name: 'Cache Search Results',
            description: 'Cache frequent search results for faster access',
            condition: '{">=": [{"var": "queryFrequency"}, 3]}',
            action: 'cache_result',
            parameters: {
              cacheKey: 'search_{{query}}_{{type}}',
              ttl: 3600
            },
            impact: {
              timeReduction: 80,
              qualityImpact: -0.1,
              costReduction: 90
            }
          }
        ],
        performance: {
          averageExecutionTime: 5000,
          successRate: 0.95,
          qualityScore: 0.88,
          userSatisfaction: 0.92
        },
        lastUpdated: new Date()
      },
      {
        id: 'batch-processing',
        workflowType: 'batch_media_processing',
        optimizations: [
          {
            id: 'batch_api_calls',
            name: 'Batch API Calls',
            description: 'Group multiple API calls into batches',
            condition: '{">=": [{"var": "itemCount"}, 5]}',
            action: 'batch_operations',
            parameters: {
              batchSize: 10,
              maxConcurrent: 3
            },
            impact: {
              timeReduction: 50,
              qualityImpact: 0,
              costReduction: 20
            }
          }
        ],
        performance: {
          averageExecutionTime: 15000,
          successRate: 0.89,
          qualityScore: 0.91,
          userSatisfaction: 0.87
        },
        lastUpdated: new Date()
      }
    ];

    optimizations.forEach(opt => {
      this.optimizations.set(opt.id, opt);
    });

    console.log(`[AdvancedOrchestrator] Initialized ${optimizations.length} workflow optimizations`);
  }

  /**
   * Execute optimized workflow
   */
  async executeOptimizedWorkflow(
    workflowType: string,
    steps: any[],
    context: any,
    userId: string,
    tenantId: string,
    correlationId: string
  ): Promise<{
    result: any;
    optimizationsApplied: string[];
    performanceGains: {
      timeReduction: number;
      qualityImpact: number;
      costReduction: number;
    };
    cacheHits: number;
  }> {
    console.log(`[${correlationId}] Executing optimized workflow: ${workflowType}`);

    const startTime = Date.now();
    let optimizationsApplied: string[] = [];
    let performanceGains = { timeReduction: 0, qualityImpact: 0, costReduction: 0 };
    let cacheHits = 0;

    // 1. Check for applicable optimizations
    const optimization = this.optimizations.get(workflowType);
    const applicableRules = optimization ? this.getApplicableOptimizations(optimization, context) : [];

    // 2. Check cache first
    const cacheKey = this.generateCacheKey(workflowType, context);
    const cachedResult = this.getCachedResult(cacheKey);

    if (cachedResult) {
      console.log(`[${correlationId}] Cache hit for workflow: ${workflowType}`);
      cacheHits = 1;
      this.updateCacheStats(cacheKey);

      return {
        result: cachedResult.result,
        optimizationsApplied: ['cache_hit'],
        performanceGains: { timeReduction: 90, qualityImpact: cachedResult.qualityScore - 1, costReduction: 95 },
        cacheHits
      };
    }

    // 3. Apply optimizations
    let optimizedSteps = [...steps];

    for (const rule of applicableRules) {
      switch (rule.action) {
        case 'parallel_execution':
          optimizedSteps = this.applyParallelExecution(optimizedSteps, rule.parameters);
          break;
        case 'batch_operations':
          optimizedSteps = this.applyBatchOperations(optimizedSteps, rule.parameters);
          break;
        case 'skip_step':
          optimizedSteps = this.applySkipStep(optimizedSteps, rule.parameters);
          break;
        case 'use_alternative':
          optimizedSteps = this.applyAlternativeTool(optimizedSteps, rule.parameters);
          break;
      }

      optimizationsApplied.push(rule.name);
      performanceGains.timeReduction += rule.impact.timeReduction;
      performanceGains.qualityImpact += rule.impact.qualityImpact;
      performanceGains.costReduction += rule.impact.costReduction;
    }

    // 4. Execute optimized workflow
    const executionResult = await this.executeSteps(optimizedSteps, context, userId, tenantId, correlationId);

    // 5. Cache result if beneficial
    if (this.shouldCacheResult(workflowType, context, executionResult)) {
      await this.cacheResult(cacheKey, workflowType, context, executionResult, correlationId);
    }

    // 6. Record performance metrics
    const executionTime = Date.now() - startTime;
    this.recordPerformanceMetrics(workflowType, {
      executionTime,
      optimizationsApplied,
      performanceGains,
      success: executionResult.success,
      qualityScore: executionResult.qualityScore || 0
    });

    return {
      result: executionResult,
      optimizationsApplied,
      performanceGains,
      cacheHits
    };
  }

  /**
   * Learn user patterns for predictive optimization
   */
  async learnUserPatterns(
    userId: string,
    tenantId: string,
    intent: string,
    workflow: string,
    context: any
  ): Promise<void> {
    const key = `${userId}:${tenantId}`;
    let patterns = this.contextPatterns.get(key) || [];

    // Find existing pattern or create new one
    let pattern = patterns.find(p =>
      p.pattern.intents.includes(intent) &&
      p.pattern.workflows.includes(workflow)
    );

    if (!pattern) {
      pattern = {
        id: `pattern_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId,
        tenantId,
        pattern: {
          intents: [intent],
          workflows: [workflow],
          timeOfDay: this.getTimeOfDay(),
          frequency: 1
        },
        predictions: {
          nextLikelyIntent: intent,
          confidence: 0.5,
          suggestedPreparation: []
        },
        lastSeen: new Date()
      };
      patterns.push(pattern);
    } else {
      pattern.pattern.frequency++;
      pattern.lastSeen = new Date();

      // Update predictions based on conversation history
      const conversationContext = await this.conversationManager.getRecentContext(userId, tenantId, 10);
      this.updatePredictions(pattern, conversationContext);
    }

    this.contextPatterns.set(key, patterns);

    // Keep only recent patterns (last 30 days)
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    this.contextPatterns.set(key, patterns.filter(p => p.lastSeen > cutoff));
  }

  /**
   * Get predictive suggestions for user
   */
  async getPredictiveSuggestions(
    userId: string,
    tenantId: string,
    currentContext?: any
  ): Promise<{
    nextLikelyActions: Array<{
      action: string;
      confidence: number;
      reasoning: string;
    }>;
    preparationSuggestions: string[];
    contextOptimizations: string[];
  }> {
    const key = `${userId}:${tenantId}`;
    const patterns = this.contextPatterns.get(key) || [];

    if (patterns.length === 0) {
      return {
        nextLikelyActions: [],
        preparationSuggestions: [],
        contextOptimizations: []
      };
    }

    // Sort patterns by frequency and recency
    const sortedPatterns = patterns
      .sort((a, b) => {
        const aScore = a.pattern.frequency * (1 - (Date.now() - a.lastSeen.getTime()) / (7 * 24 * 60 * 60 * 1000));
        const bScore = b.pattern.frequency * (1 - (Date.now() - b.lastSeen.getTime()) / (7 * 24 * 60 * 60 * 1000));
        return bScore - aScore;
      })
      .slice(0, 5);

    const nextLikelyActions = sortedPatterns.map(pattern => ({
      action: pattern.predictions.nextLikelyIntent,
      confidence: Math.min(pattern.predictions.confidence, pattern.pattern.frequency / 10),
      reasoning: `Based on ${pattern.pattern.frequency} similar interactions`
    }));

    const preparationSuggestions = Array.from(new Set(
      sortedPatterns.flatMap(p => p.predictions.suggestedPreparation)
    )).slice(0, 3);

    const contextOptimizations = this.generateContextOptimizations(sortedPatterns, currentContext);

    return {
      nextLikelyActions,
      preparationSuggestions,
      contextOptimizations
    };
  }

  /**
   * Optimize workflow scheduling and resource allocation
   */
  async optimizeResourceAllocation(
    pendingWorkflows: Array<{
      id: string;
      type: string;
      priority: number;
      estimatedResources: any;
      userId: string;
      tenantId: string;
    }>
  ): Promise<{
    scheduledWorkflows: Array<{
      id: string;
      scheduledTime: Date;
      allocatedResources: any;
      estimatedCompletion: Date;
    }>;
    resourceUtilization: {
      cpu: number;
      memory: number;
      network: number;
    };
    recommendations: string[];
  }> {
    // Sort workflows by priority and resource efficiency
    const sortedWorkflows = pendingWorkflows.sort((a, b) => {
      const aEfficiency = this.calculateResourceEfficiency(a);
      const bEfficiency = this.calculateResourceEfficiency(b);

      // Higher priority and efficiency first
      return (b.priority * bEfficiency) - (a.priority * aEfficiency);
    });

    const scheduledWorkflows: Array<{
      id: string;
      scheduledTime: Date;
      allocatedResources: any;
      estimatedCompletion: Date;
    }> = [];

    let currentTime = new Date();
    let resourceUtilization = { cpu: 0, memory: 0, network: 0 };
    const maxResources = { cpu: 100, memory: 100, network: 100 };

    for (const workflow of sortedWorkflows) {
      const requiredResources = workflow.estimatedResources;

      // Check if resources are available
      if (
        resourceUtilization.cpu + requiredResources.cpu <= maxResources.cpu &&
        resourceUtilization.memory + requiredResources.memory <= maxResources.memory &&
        resourceUtilization.network + requiredResources.network <= maxResources.network
      ) {
        // Schedule immediately
        const estimatedDuration = this.getEstimatedDuration(workflow.type);
        const estimatedCompletion = new Date(currentTime.getTime() + estimatedDuration);

        scheduledWorkflows.push({
          id: workflow.id,
          scheduledTime: new Date(currentTime),
          allocatedResources: requiredResources,
          estimatedCompletion
        });

        resourceUtilization.cpu += requiredResources.cpu;
        resourceUtilization.memory += requiredResources.memory;
        resourceUtilization.network += requiredResources.network;
      } else {
        // Schedule for later when resources become available
        const nextAvailableTime = this.findNextAvailableSlot(scheduledWorkflows, requiredResources);
        const estimatedDuration = this.getEstimatedDuration(workflow.type);

        scheduledWorkflows.push({
          id: workflow.id,
          scheduledTime: nextAvailableTime,
          allocatedResources: requiredResources,
          estimatedCompletion: new Date(nextAvailableTime.getTime() + estimatedDuration)
        });
      }
    }

    const recommendations = this.generateResourceRecommendations(resourceUtilization, scheduledWorkflows);

    return {
      scheduledWorkflows,
      resourceUtilization,
      recommendations
    };
  }

  /**
   * Private helper methods
   */
  private getApplicableOptimizations(optimization: WorkflowOptimization, context: any): OptimizationRule[] {
    return optimization.optimizations.filter(rule => {
      try {
        // Simple condition evaluation (would use a proper JSON Logic library in production)
        return this.evaluateCondition(rule.condition, context);
      } catch (error) {
        console.warn(`[AdvancedOrchestrator] Failed to evaluate condition for rule ${rule.id}:`, error);
        return false;
      }
    });
  }

  private evaluateCondition(condition: string, context: any): boolean {
    // Simplified condition evaluation - would use jsonlogic library in production
    try {
      const conditionObj = JSON.parse(condition);
      // For demo purposes, just return true for basic conditions
      return true;
    } catch {
      return false;
    }
  }

  private applyParallelExecution(steps: any[], parameters: any): any[] {
    // Mark steps that can run in parallel
    const parallelSteps = parameters.parallelSteps || [];
    return steps.map(step => ({
      ...step,
      canRunInParallel: parallelSteps.includes(step.name)
    }));
  }

  private applyBatchOperations(steps: any[], parameters: any): any[] {
    const batchSize = parameters.batchSize || 5;
    // Group similar operations into batches
    return steps.map(step => ({
      ...step,
      batchSize: step.type === 'api_call' ? batchSize : 1
    }));
  }

  private applySkipStep(steps: any[], parameters: any): any[] {
    const skipConditions = parameters.skipConditions || {};
    return steps.filter(step => !skipConditions[step.name]);
  }

  private applyAlternativeTool(steps: any[], parameters: any): any[] {
    const alternatives = parameters.alternatives || {};
    return steps.map(step => ({
      ...step,
      toolName: alternatives[step.toolName] || step.toolName
    }));
  }

  private async executeSteps(steps: any[], context: any, userId: string, tenantId: string, correlationId: string): Promise<any> {
    // Simplified step execution - would integrate with actual workflow executor
    const results = [];

    for (const step of steps) {
      try {
        const result = await this.toolExecutor.executeTool(
          step.toolName,
          { ...step.parameters, userId, tenantId },
          { userId, tenantId }
        );
        results.push(result);
      } catch (error) {
        console.error(`[${correlationId}] Step execution failed:`, error);
        results.push({ error: error instanceof Error ? error.message : 'Unknown error' });
      }
    }

    return {
      success: results.every(r => !r.error),
      results,
      qualityScore: 0.85 // Would be calculated based on actual quality assessment
    };
  }

  private generateCacheKey(workflowType: string, context: any): string {
    const keyData = {
      type: workflowType,
      query: context.query,
      userId: context.userId,
      // Add other relevant context
    };
    return `workflow_${Buffer.from(JSON.stringify(keyData)).toString('base64')}`;
  }

  private getCachedResult(cacheKey: string): WorkflowCache | null {
    const cached = this.workflowCache.get(cacheKey);
    if (cached && cached.expiresAt > new Date()) {
      return cached;
    }
    return null;
  }

  private updateCacheStats(cacheKey: string): void {
    const cached = this.workflowCache.get(cacheKey);
    if (cached) {
      cached.hitCount++;
      cached.lastUsed = new Date();
    }
  }

  private shouldCacheResult(workflowType: string, context: any, result: any): boolean {
    // Cache successful results for common workflow types
    return result.success && ['search_create_canvas', 'content_analysis'].includes(workflowType);
  }

  private async cacheResult(cacheKey: string, workflowType: string, context: any, result: any, correlationId: string): Promise<void> {
    const cache: WorkflowCache = {
      key: cacheKey,
      workflowType,
      parameters: context,
      result,
      qualityScore: result.qualityScore || 0.8,
      expiresAt: new Date(Date.now() + 3600000), // 1 hour
      hitCount: 0,
      lastUsed: new Date()
    };

    this.workflowCache.set(cacheKey, cache);
    console.log(`[${correlationId}] Cached workflow result: ${workflowType}`);
  }

  private recordPerformanceMetrics(workflowType: string, metrics: any): void {
    if (!this.performanceMetrics.has(workflowType)) {
      this.performanceMetrics.set(workflowType, []);
    }

    const history = this.performanceMetrics.get(workflowType)!;
    history.push({
      ...metrics,
      timestamp: new Date()
    });

    // Keep only last 100 metrics per workflow type
    if (history.length > 100) {
      history.splice(0, history.length - 100);
    }
  }

  private learnFromPerformanceData(): void {
    // Analyze performance data and update optimizations
    for (const [workflowType, metrics] of Array.from(this.performanceMetrics.entries())) {
      if (metrics.length < 10) continue; // Need sufficient data

      const recentMetrics = metrics.slice(-20); // Last 20 executions
      const avgExecutionTime = recentMetrics.reduce((sum, m) => sum + m.executionTime, 0) / recentMetrics.length;
      const successRate = recentMetrics.filter(m => m.success).length / recentMetrics.length;
      const avgQualityScore = recentMetrics.reduce((sum, m) => sum + m.qualityScore, 0) / recentMetrics.length;

      // Update optimization performance
      const optimization = this.optimizations.get(workflowType);
      if (optimization) {
        optimization.performance = {
          averageExecutionTime: avgExecutionTime,
          successRate,
          qualityScore: avgQualityScore,
          userSatisfaction: optimization.performance.userSatisfaction // Keep existing or calculate from feedback
        };
        optimization.lastUpdated = new Date();
      }
    }

    console.log('[AdvancedOrchestrator] Updated optimization performance data');
  }

  private cleanupCache(): void {
    const now = new Date();
    let cleanedCount = 0;

    for (const [key, cache] of Array.from(this.workflowCache.entries())) {
      if (cache.expiresAt < now) {
        this.workflowCache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`[AdvancedOrchestrator] Cleaned up ${cleanedCount} expired cache entries`);
    }
  }

  private updatePredictions(pattern: ContextPattern, conversationContext: any): void {
    // Simple prediction update based on conversation patterns
    if (conversationContext.commonIntents.length > 0) {
      pattern.predictions.nextLikelyIntent = conversationContext.commonIntents[0];
      pattern.predictions.confidence = Math.min(0.9, pattern.pattern.frequency / 10);
    }

    // Generate preparation suggestions
    pattern.predictions.suggestedPreparation = [
      'Pre-load search results',
      'Prepare canvas templates',
      'Cache user preferences'
    ].slice(0, 2);
  }

  private generateContextOptimizations(patterns: ContextPattern[], currentContext: any): string[] {
    const optimizations: string[] = [];

    if (patterns.some(p => p.pattern.workflows.includes('search_create_canvas'))) {
      optimizations.push('Enable parallel search and canvas creation');
    }

    if (patterns.some(p => p.pattern.frequency > 5)) {
      optimizations.push('Enable result caching for frequent queries');
    }

    return optimizations;
  }

  private getTimeOfDay(): string {
    const hour = new Date().getHours();
    if (hour < 6) return 'night';
    if (hour < 12) return 'morning';
    if (hour < 18) return 'afternoon';
    return 'evening';
  }

  private calculateResourceEfficiency(workflow: any): number {
    // Simple efficiency calculation based on resource requirements
    const resources = workflow.estimatedResources;
    const totalResources = resources.cpu + resources.memory + resources.network;
    return workflow.priority / Math.max(totalResources, 1);
  }

  private getEstimatedDuration(workflowType: string): number {
    const durations: { [key: string]: number } = {
      'search_create_canvas': 5000,
      'batch_media_processing': 15000,
      'content_analysis': 10000
    };
    return durations[workflowType] || 8000;
  }

  private findNextAvailableSlot(scheduledWorkflows: any[], requiredResources: any): Date {
    // Find the earliest time when resources become available
    const sortedByCompletion = scheduledWorkflows.sort((a, b) =>
      a.estimatedCompletion.getTime() - b.estimatedCompletion.getTime()
    );

    if (sortedByCompletion.length === 0) {
      return new Date();
    }

    return sortedByCompletion[0].estimatedCompletion;
  }

  private generateResourceRecommendations(utilization: any, scheduled: any[]): string[] {
    const recommendations: string[] = [];

    if (utilization.cpu > 80) {
      recommendations.push('Consider scaling CPU resources');
    }
    if (utilization.memory > 80) {
      recommendations.push('Consider increasing memory allocation');
    }
    if (scheduled.length > 10) {
      recommendations.push('High workflow volume detected - consider load balancing');
    }

    return recommendations;
  }

  /**
   * Public API methods
   */
  getOptimizationStats(): {
    totalOptimizations: number;
    activeOptimizations: number;
    cacheHitRate: number;
    averagePerformanceGain: number;
  } {
    const totalOptimizations = Array.from(this.optimizations.values())
      .reduce((sum, opt) => sum + opt.optimizations.length, 0);

    const activeOptimizations = Array.from(this.optimizations.values())
      .reduce((sum, opt) => sum + opt.optimizations.filter(rule => rule.impact.timeReduction > 0).length, 0);

    const totalCacheRequests = Array.from(this.workflowCache.values())
      .reduce((sum, cache) => sum + cache.hitCount, 0);
    const cacheHitRate = totalCacheRequests > 0 ?
      Array.from(this.workflowCache.values()).length / totalCacheRequests : 0;

    const allMetrics = Array.from(this.performanceMetrics.values()).flat();
    const averagePerformanceGain = allMetrics.length > 0 ?
      allMetrics.reduce((sum, m) => sum + (m.performanceGains?.timeReduction || 0), 0) / allMetrics.length : 0;

    return {
      totalOptimizations,
      activeOptimizations,
      cacheHitRate,
      averagePerformanceGain
    };
  }

  getCacheStats(): {
    totalEntries: number;
    hitRate: number;
    memoryUsage: string;
    topCachedWorkflows: Array<{ type: string; hits: number }>;
  } {
    const caches = Array.from(this.workflowCache.values());
    const totalHits = caches.reduce((sum, cache) => sum + cache.hitCount, 0);
    const hitRate = caches.length > 0 ? totalHits / caches.length : 0;

    // Group by workflow type
    const workflowHits: { [type: string]: number } = {};
    caches.forEach(cache => {
      workflowHits[cache.workflowType] = (workflowHits[cache.workflowType] || 0) + cache.hitCount;
    });

    const topCachedWorkflows = Object.entries(workflowHits)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([type, hits]) => ({ type, hits }));

    return {
      totalEntries: caches.length,
      hitRate,
      memoryUsage: `${(caches.length * 0.1).toFixed(1)} MB`, // Rough estimate
      topCachedWorkflows
    };
  }
}
