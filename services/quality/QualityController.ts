import { RedisContextService } from '../context/RedisContextService';

export interface QualityCheck {
  id: string;
  name: string;
  description: string;
  category: 'technical' | 'content' | 'user_experience' | 'performance';
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
}

export interface QualityResult {
  checkId: string;
  passed: boolean;
  score: number; // 0-1
  message: string;
  details?: any;
  suggestions?: string[];
  timestamp: Date;
}

export interface QualityAssessment {
  id: string;
  targetType: 'workflow' | 'tool_execution' | 'content' | 'user_interaction';
  targetId: string;
  userId: string;
  tenantId: string;
  results: QualityResult[];
  overallScore: number;
  overallStatus: 'passed' | 'warning' | 'failed';
  timestamp: Date;
  correlationId: string;
}

export interface QualityStandards {
  userId: string;
  tenantId: string;
  level: 'draft' | 'standard' | 'high';
  customThresholds?: {
    [checkId: string]: number;
  };
  enabledChecks: string[];
  autoReject?: boolean;
}

export class QualityController {
  private contextService: RedisContextService;
  private qualityChecks: Map<string, QualityCheck> = new Map();
  private assessmentHistory: Map<string, QualityAssessment[]> = new Map();
  private userStandards: Map<string, QualityStandards> = new Map();

  constructor(contextService: RedisContextService) {
    this.contextService = contextService;
    this.initializeQualityChecks();
  }

  private initializeQualityChecks() {
    const checks: QualityCheck[] = [
      // Technical Quality Checks
      {
        id: 'file_integrity',
        name: 'File Integrity',
        description: 'Verify file format compliance and data integrity',
        category: 'technical',
        severity: 'high',
        enabled: true
      },
      {
        id: 'api_response_validation',
        name: 'API Response Validation',
        description: 'Validate API responses match expected schemas',
        category: 'technical',
        severity: 'medium',
        enabled: true
      },
      {
        id: 'resource_limits',
        name: 'Resource Limits',
        description: 'Check if resource usage is within acceptable limits',
        category: 'performance',
        severity: 'medium',
        enabled: true
      },
      {
        id: 'execution_time',
        name: 'Execution Time',
        description: 'Verify operations complete within reasonable time',
        category: 'performance',
        severity: 'low',
        enabled: true
      },

      // Content Quality Checks
      {
        id: 'search_relevance',
        name: 'Search Relevance',
        description: 'Assess relevance of search results to query',
        category: 'content',
        severity: 'medium',
        enabled: true
      },
      {
        id: 'content_appropriateness',
        name: 'Content Appropriateness',
        description: 'Basic content appropriateness validation',
        category: 'content',
        severity: 'high',
        enabled: true
      },
      {
        id: 'duplicate_detection',
        name: 'Duplicate Detection',
        description: 'Identify potential duplicate content',
        category: 'content',
        severity: 'low',
        enabled: true
      },

      // User Experience Checks
      {
        id: 'response_clarity',
        name: 'Response Clarity',
        description: 'Assess clarity and helpfulness of responses',
        category: 'user_experience',
        severity: 'medium',
        enabled: true
      },
      {
        id: 'workflow_completion',
        name: 'Workflow Completion',
        description: 'Verify workflow completed successfully',
        category: 'user_experience',
        severity: 'high',
        enabled: true
      },
      {
        id: 'error_handling',
        name: 'Error Handling',
        description: 'Assess quality of error messages and recovery options',
        category: 'user_experience',
        severity: 'medium',
        enabled: true
      }
    ];

    checks.forEach(check => {
      this.qualityChecks.set(check.id, check);
    });

    console.log(`[QualityController] Initialized ${checks.length} quality checks`);
  }

  /**
   * Assess quality of a target (workflow, tool execution, etc.)
   */
  async assessQuality(
    targetType: 'workflow' | 'tool_execution' | 'content' | 'user_interaction',
    targetId: string,
    targetData: any,
    userId: string,
    tenantId: string,
    correlationId: string
  ): Promise<QualityAssessment> {
    console.log(`[${correlationId}] Starting quality assessment for ${targetType}: ${targetId}`);

    const userStandards = this.getUserStandards(userId, tenantId);
    const applicableChecks = this.getApplicableChecks(targetType, userStandards);

    const results: QualityResult[] = [];

    for (const check of applicableChecks) {
      try {
        const result = await this.runQualityCheck(check, targetData, userStandards, correlationId);
        results.push(result);
      } catch (error) {
        console.error(`[${correlationId}] Quality check ${check.id} failed:`, error);
        results.push({
          checkId: check.id,
          passed: false,
          score: 0,
          message: `Quality check failed: ${error instanceof Error ? error instanceof Error ? error.message : 'Unknown error' : 'Unknown error'}`,
          timestamp: new Date()
        });
      }
    }

    // Calculate overall score and status
    const overallScore = results.length > 0
      ? results.reduce((sum, r) => sum + r.score, 0) / results.length
      : 0;

    const overallStatus = this.determineOverallStatus(results, userStandards);

    const assessment: QualityAssessment = {
      id: `qa_${correlationId}`,
      targetType,
      targetId,
      userId,
      tenantId,
      results,
      overallScore,
      overallStatus,
      timestamp: new Date(),
      correlationId
    };

    // Store assessment history
    this.addToAssessmentHistory(userId, tenantId, assessment);

    console.log(`[${correlationId}] Quality assessment completed. Score: ${overallScore.toFixed(2)}, Status: ${overallStatus}`);
    return assessment;
  }

  /**
   * Run individual quality check
   */
  private async runQualityCheck(
    check: QualityCheck,
    targetData: any,
    userStandards: QualityStandards,
    correlationId: string
  ): Promise<QualityResult> {
    const threshold = userStandards.customThresholds?.[check.id] || this.getDefaultThreshold(check, userStandards.level);

    switch (check.id) {
      case 'file_integrity':
        return this.checkFileIntegrity(targetData, threshold);

      case 'api_response_validation':
        return this.checkApiResponseValidation(targetData, threshold);

      case 'resource_limits':
        return this.checkResourceLimits(targetData, threshold);

      case 'execution_time':
        return this.checkExecutionTime(targetData, threshold);

      case 'search_relevance':
        return this.checkSearchRelevance(targetData, threshold);

      case 'content_appropriateness':
        return this.checkContentAppropriateness(targetData, threshold);

      case 'duplicate_detection':
        return this.checkDuplicateDetection(targetData, threshold);

      case 'response_clarity':
        return this.checkResponseClarity(targetData, threshold);

      case 'workflow_completion':
        return this.checkWorkflowCompletion(targetData, threshold);

      case 'error_handling':
        return this.checkErrorHandling(targetData, threshold);

      default:
        return {
          checkId: check.id,
          passed: true,
          score: 1,
          message: 'Check not implemented',
          timestamp: new Date()
        };
    }
  }

  /**
   * Individual quality check implementations
   */
  private checkFileIntegrity(data: any, threshold: number): QualityResult {
    let score = 1;
    let message = 'File integrity check passed';
    const issues: string[] = [];

    if (data.files) {
      for (const file of data.files) {
        if (!file.format || !file.size) {
          score -= 0.2;
          issues.push(`File ${file.name || 'unknown'} missing format or size information`);
        }
        if (file.corrupted) {
          score -= 0.5;
          issues.push(`File ${file.name || 'unknown'} appears corrupted`);
        }
      }
    }

    score = Math.max(0, score);
    const passed = score >= threshold;

    if (!passed) {
      message = `File integrity issues detected: ${issues.join(', ')}`;
    }

    return {
      checkId: 'file_integrity',
      passed,
      score,
      message,
      details: { issues },
      suggestions: issues.length > 0 ? ['Re-upload corrupted files', 'Verify file formats'] : undefined,
      timestamp: new Date()
    };
  }

  private checkApiResponseValidation(data: any, threshold: number): QualityResult {
    let score = 1;
    let message = 'API responses are valid';
    const issues: string[] = [];

    if (data.apiCalls) {
      for (const call of data.apiCalls) {
        if (call.status >= 400) {
          score -= 0.3;
          issues.push(`API call to ${call.endpoint} returned ${call.status}`);
        }
        if (!call.responseSchema || call.schemaValid === false) {
          score -= 0.2;
          issues.push(`API response from ${call.endpoint} failed schema validation`);
        }
      }
    }

    score = Math.max(0, score);
    const passed = score >= threshold;

    if (!passed) {
      message = `API validation issues: ${issues.join(', ')}`;
    }

    return {
      checkId: 'api_response_validation',
      passed,
      score,
      message,
      details: { issues },
      suggestions: issues.length > 0 ? ['Check API endpoints', 'Verify response schemas'] : undefined,
      timestamp: new Date()
    };
  }

  private checkResourceLimits(data: any, threshold: number): QualityResult {
    let score = 1;
    let message = 'Resource usage within limits';
    const issues: string[] = [];

    if (data.resourceUsage) {
      const { memory, cpu, storage } = data.resourceUsage;

      if (memory && memory.used / memory.limit > 0.9) {
        score -= 0.3;
        issues.push('High memory usage detected');
      }
      if (cpu && cpu.usage > 0.8) {
        score -= 0.2;
        issues.push('High CPU usage detected');
      }
      if (storage && storage.used / storage.limit > 0.95) {
        score -= 0.4;
        issues.push('Storage nearly full');
      }
    }

    score = Math.max(0, score);
    const passed = score >= threshold;

    if (!passed) {
      message = `Resource limit issues: ${issues.join(', ')}`;
    }

    return {
      checkId: 'resource_limits',
      passed,
      score,
      message,
      details: { issues, usage: data.resourceUsage },
      suggestions: issues.length > 0 ? ['Optimize resource usage', 'Consider scaling'] : undefined,
      timestamp: new Date()
    };
  }

  private checkExecutionTime(data: any, threshold: number): QualityResult {
    let score = 1;
    let message = 'Execution time acceptable';

    if (data.executionTime) {
      const timeMs = data.executionTime;
      const maxAcceptableTime = 30000; // 30 seconds

      if (timeMs > maxAcceptableTime) {
        score = Math.max(0, 1 - (timeMs - maxAcceptableTime) / maxAcceptableTime);
        message = `Execution took ${(timeMs / 1000).toFixed(1)}s (longer than expected)`;
      }
    }

    const passed = score >= threshold;

    return {
      checkId: 'execution_time',
      passed,
      score,
      message,
      details: { executionTime: data.executionTime },
      suggestions: !passed ? ['Consider optimizing the workflow', 'Break into smaller steps'] : undefined,
      timestamp: new Date()
    };
  }

  private checkSearchRelevance(data: any, threshold: number): QualityResult {
    let score = 1;
    let message = 'Search results are relevant';

    if (data.searchResults && data.query) {
      const results = data.searchResults;
      const query = data.query.toLowerCase();

      // Simple relevance scoring based on keyword matching
      let relevantCount = 0;
      for (const result of results) {
        const title = (result.title || '').toLowerCase();
        const description = (result.description || '').toLowerCase();
        const tags = (result.tags || []).join(' ').toLowerCase();

        const text = `${title} ${description} ${tags}`;
        const queryWords = query.split(' ');
        const matchingWords = queryWords.filter((word: string) => text.includes(word));

        if (matchingWords.length / queryWords.length > 0.5) {
          relevantCount++;
        }
      }

      score = results.length > 0 ? relevantCount / results.length : 0;

      if (score < 0.5) {
        message = `Only ${Math.round(score * 100)}% of search results appear relevant`;
      }
    }

    const passed = score >= threshold;

    return {
      checkId: 'search_relevance',
      passed,
      score,
      message,
      details: { relevanceScore: score },
      suggestions: !passed ? ['Try different search terms', 'Use more specific keywords'] : undefined,
      timestamp: new Date()
    };
  }

  private checkContentAppropriateness(data: any, threshold: number): QualityResult {
    let score = 1;
    let message = 'Content appears appropriate';
    const issues: string[] = [];

    // Basic content appropriateness checks
    if (data.content || data.searchResults) {
      const contentItems = data.content || data.searchResults || [];

      for (const item of contentItems) {
        const text = `${item.title || ''} ${item.description || ''} ${(item.tags || []).join(' ')}`.toLowerCase();

        // Simple keyword-based filtering (would be enhanced with ML in production)
        const inappropriateKeywords = ['explicit', 'nsfw', 'adult', 'violence'];
        const foundKeywords = inappropriateKeywords.filter(keyword => text.includes(keyword));

        if (foundKeywords.length > 0) {
          score -= 0.3;
          issues.push(`Content may contain inappropriate material: ${foundKeywords.join(', ')}`);
        }
      }
    }

    score = Math.max(0, score);
    const passed = score >= threshold;

    if (!passed) {
      message = `Content appropriateness concerns: ${issues.join(', ')}`;
    }

    return {
      checkId: 'content_appropriateness',
      passed,
      score,
      message,
      details: { issues },
      suggestions: issues.length > 0 ? ['Review content filters', 'Use more specific search terms'] : undefined,
      timestamp: new Date()
    };
  }

  private checkDuplicateDetection(data: any, threshold: number): QualityResult {
    let score = 1;
    let message = 'No significant duplicates detected';
    let duplicateCount = 0;

    if (data.searchResults || data.items) {
      const items = data.searchResults || data.items || [];
      const seen = new Set();

      for (const item of items) {
        const signature = `${item.title || ''}_${item.url || ''}_${item.id || ''}`.toLowerCase();
        if (seen.has(signature)) {
          duplicateCount++;
        } else {
          seen.add(signature);
        }
      }

      if (items.length > 0) {
        score = 1 - (duplicateCount / items.length);
        if (duplicateCount > 0) {
          message = `Found ${duplicateCount} potential duplicates out of ${items.length} items`;
        }
      }
    }

    const passed = score >= threshold;

    return {
      checkId: 'duplicate_detection',
      passed,
      score,
      message,
      details: { duplicateCount },
      suggestions: duplicateCount > 0 ? ['Remove duplicate items', 'Refine search criteria'] : undefined,
      timestamp: new Date()
    };
  }

  private checkResponseClarity(data: any, threshold: number): QualityResult {
    let score = 1;
    let message = 'Response is clear and helpful';
    const issues: string[] = [];

    if (data.response || data.message) {
      const response = data.response || data.message || '';

      // Basic clarity checks
      if (response.length < 10) {
        score -= 0.4;
        issues.push('Response is too short');
      }
      if (response.length > 1000) {
        score -= 0.2;
        issues.push('Response may be too verbose');
      }
      if (!response.includes('.') && !response.includes('!') && !response.includes('?')) {
        score -= 0.3;
        issues.push('Response lacks proper punctuation');
      }

      // Check for helpful elements
      const hasActionableInfo = /\b(you can|try|consider|should|would|could)\b/i.test(response);
      if (!hasActionableInfo) {
        score -= 0.2;
        issues.push('Response lacks actionable guidance');
      }
    }

    score = Math.max(0, score);
    const passed = score >= threshold;

    if (!passed) {
      message = `Response clarity issues: ${issues.join(', ')}`;
    }

    return {
      checkId: 'response_clarity',
      passed,
      score,
      message,
      details: { issues },
      suggestions: issues.length > 0 ? ['Improve response structure', 'Add more helpful details'] : undefined,
      timestamp: new Date()
    };
  }

  private checkWorkflowCompletion(data: any, threshold: number): QualityResult {
    let score = 1;
    let message = 'Workflow completed successfully';

    if (data.workflow || data.execution) {
      const workflow = data.workflow || data.execution;

      if (workflow.status === 'failed') {
        score = 0;
        message = 'Workflow failed to complete';
      } else if (workflow.status === 'partial') {
        score = 0.5;
        message = 'Workflow partially completed';
      } else if (workflow.status === 'requires_approval') {
        score = 0.8;
        message = 'Workflow requires user approval';
      }

      // Check step completion rate
      if (workflow.steps) {
        const completedSteps = workflow.steps.filter((s: any) => s.status === 'completed').length;
        const stepCompletionRate = completedSteps / workflow.steps.length;
        score = Math.min(score, stepCompletionRate);
      }
    }

    const passed = score >= threshold;

    return {
      checkId: 'workflow_completion',
      passed,
      score,
      message,
      details: { workflowStatus: data.workflow?.status },
      suggestions: !passed ? ['Review workflow errors', 'Try simpler approach'] : undefined,
      timestamp: new Date()
    };
  }

  private checkErrorHandling(data: any, threshold: number): QualityResult {
    let score = 1;
    let message = 'Error handling is appropriate';
    const issues: string[] = [];

    if (data.errors || data.recoveryOptions) {
      const errors = data.errors || [];
      const recoveryOptions = data.recoveryOptions || [];

      for (const error of errors) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        if (!msg || msg.length < 10) {
          score -= 0.3;
          issues.push('Error message is too brief or missing');
        }
        if (!error.code) {
          score -= 0.2;
          issues.push('Error lacks proper categorization');
        }
      }

      if (errors.length > 0 && recoveryOptions.length === 0) {
        score -= 0.4;
        issues.push('No recovery options provided for errors');
      }
    }

    score = Math.max(0, score);
    const passed = score >= threshold;

    if (!passed) {
      message = `Error handling issues: ${issues.join(', ')}`;
    }

    return {
      checkId: 'error_handling',
      passed,
      score,
      message,
      details: { issues },
      suggestions: issues.length > 0 ? ['Improve error messages', 'Add recovery options'] : undefined,
      timestamp: new Date()
    };
  }

  /**
   * Helper methods
   */
  private getUserStandards(userId: string, tenantId: string): QualityStandards {
    const key = `${userId}:${tenantId}`;
    return this.userStandards.get(key) || {
      userId,
      tenantId,
      level: 'standard',
      enabledChecks: Array.from(this.qualityChecks.keys()),
      autoReject: false
    };
  }

  private getApplicableChecks(targetType: string, userStandards: QualityStandards): QualityCheck[] {
    return Array.from(this.qualityChecks.values())
      .filter(check => check.enabled && userStandards.enabledChecks.includes(check.id));
  }

  private getDefaultThreshold(check: QualityCheck, level: 'draft' | 'standard' | 'high'): number {
    const thresholds = {
      draft: { low: 0.3, medium: 0.4, high: 0.5, critical: 0.6 },
      standard: { low: 0.5, medium: 0.6, high: 0.7, critical: 0.8 },
      high: { low: 0.7, medium: 0.8, high: 0.9, critical: 0.95 }
    };

    return thresholds[level][check.severity];
  }

  private determineOverallStatus(results: QualityResult[], userStandards: QualityStandards): 'passed' | 'warning' | 'failed' {
    const criticalFailures = results.filter(r => !r.passed && this.qualityChecks.get(r.checkId)?.severity === 'critical');
    const highFailures = results.filter(r => !r.passed && this.qualityChecks.get(r.checkId)?.severity === 'high');
    const anyFailures = results.filter(r => !r.passed);

    if (criticalFailures.length > 0) {
      return 'failed';
    }
    if (highFailures.length > 0 || anyFailures.length > results.length * 0.5) {
      return 'warning';
    }
    return 'passed';
  }

  private addToAssessmentHistory(userId: string, tenantId: string, assessment: QualityAssessment) {
    const key = `${userId}:${tenantId}`;
    if (!this.assessmentHistory.has(key)) {
      this.assessmentHistory.set(key, []);
    }

    const history = this.assessmentHistory.get(key)!;
    history.push(assessment);

    // Keep only last 100 assessments
    if (history.length > 100) {
      history.splice(0, history.length - 100);
    }
  }

  /**
   * Public API methods
   */
  async updateUserStandards(userId: string, tenantId: string, standards: Partial<QualityStandards>): Promise<void> {
    const key = `${userId}:${tenantId}`;
    const current = this.getUserStandards(userId, tenantId);

    this.userStandards.set(key, {
      ...current,
      ...standards
    });

    console.log(`[QualityController] Updated quality standards for ${userId}`);
  }

  getQualityChecks(): QualityCheck[] {
    return Array.from(this.qualityChecks.values());
  }

  getAssessmentHistory(userId: string, tenantId: string, limit: number = 10): QualityAssessment[] {
    const key = `${userId}:${tenantId}`;
    const history = this.assessmentHistory.get(key) || [];
    return history.slice(-limit);
  }

  getQualityStats(userId?: string, tenantId?: string): {
    totalAssessments: number;
    averageScore: number;
    passRate: number;
    commonIssues: string[];
    checkPerformance: { [checkId: string]: { runs: number; passRate: number; avgScore: number } };
  } {
    let assessments: QualityAssessment[];

    if (userId && tenantId) {
      assessments = this.assessmentHistory.get(`${userId}:${tenantId}`) || [];
    } else {
      assessments = Array.from(this.assessmentHistory.values()).flat();
    }

    const totalAssessments = assessments.length;
    const averageScore = totalAssessments > 0
      ? assessments.reduce((sum, a) => sum + a.overallScore, 0) / totalAssessments
      : 0;
    const passedAssessments = assessments.filter(a => a.overallStatus === 'passed').length;
    const passRate = totalAssessments > 0 ? passedAssessments / totalAssessments : 0;

    // Common issues
    const allResults = assessments.flatMap(a => a.results);
    const failedResults = allResults.filter(r => !r.passed);
    const issueFrequency: { [issue: string]: number } = {};

    failedResults.forEach(result => {
      const checkName = this.qualityChecks.get(result.checkId)?.name || result.checkId;
      issueFrequency[checkName] = (issueFrequency[checkName] || 0) + 1;
    });

    const commonIssues = Object.entries(issueFrequency)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([issue]) => issue);

    // Check performance
    const checkPerformance: { [checkId: string]: { runs: number; passRate: number; avgScore: number } } = {};

    for (const check of Array.from(this.qualityChecks.values())) {
      const checkResults = allResults.filter(r => r.checkId === check.id);
      const runs = checkResults.length;
      const passed = checkResults.filter(r => r.passed).length;
      const passRate = runs > 0 ? passed / runs : 0;
      const avgScore = runs > 0 ? checkResults.reduce((sum, r) => sum + r.score, 0) / runs : 0;

      checkPerformance[check.id] = { runs, passRate, avgScore };
    }

    return {
      totalAssessments,
      averageScore,
      passRate,
      commonIssues,
      checkPerformance
    };
  }
}
