#!/usr/bin/env tsx

/**
 * Pre-Deployment Integration Test
 *
 * This script validates all service integrations, configurations, and dependencies
 * before AWS deployment to avoid deployment hell.
 */

import { RedisContextService } from '../services/context/RedisContextService';
import { ToolRegistry } from '../services/tools/ToolRegistry';
import { ToolExecutor } from '../services/tools/ToolExecutor';
import { QualityController } from '../services/quality/QualityController';
import { LangGraphOrchestrator } from '../services/orchestration/LangGraphOrchestrator';
import { ConversationManager } from '../services/ux/ConversationManager';
import { WebSocketManager } from '../services/websocket/WebSocketManager';
import { SimpleIntentClassifier } from '../services/intelligence/SimpleIntentClassifier';
import { SimpleLLMRouter } from '../services/intelligence/SimpleLLMRouter';

interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  message: string;
  details?: any;
  duration?: number;
}

class PreDeploymentTester {
  private results: TestResult[] = [];
  private contextService?: RedisContextService;
  private toolRegistry?: ToolRegistry;
  private toolExecutor?: ToolExecutor;

  async runAllTests(): Promise<void> {
    console.log('🚀 Starting Pre-Deployment Integration Tests...\n');

    // Environment Tests
    await this.testEnvironmentVariables();
    await this.testPackageDependencies();

    // Service Initialization Tests
    await this.testServiceInitialization();

    // Integration Tests
    await this.testRedisIntegration();
    await this.testToolRegistryIntegration();
    await this.testLangGraphIntegration();
    await this.testAPIEndpoints();

    // Workflow Tests
    await this.testCompleteWorkflow();

    // Report Results
    this.generateReport();
  }

  private async testEnvironmentVariables(): Promise<void> {
    console.log('📋 Testing Environment Variables...');

    const requiredVars = [
      'OPENAI_API_KEY',
      'FAL_KEY'
    ];

    const optionalVars = [
      'REDIS_URL',
      'DATABASE_URL',
      'LANCEDB_URL',
      'PUBLIC_API_BASE_URL',
      'ANTHROPIC_API_KEY'
    ];

    // Test required variables
    for (const varName of requiredVars) {
      const value = process.env[varName];
      if (!value) {
        this.addResult({
          name: `ENV_${varName}`,
          status: 'FAIL',
          message: `Required environment variable ${varName} is missing`
        });
      } else if (value.includes('your-') || value.includes('sk-your-')) {
        this.addResult({
          name: `ENV_${varName}`,
          status: 'FAIL',
          message: `Environment variable ${varName} contains placeholder value`
        });
      } else {
        this.addResult({
          name: `ENV_${varName}`,
          status: 'PASS',
          message: `Environment variable ${varName} is set`,
          details: { length: value.length, prefix: value.substring(0, 10) + '...' }
        });
      }
    }

    // Test optional variables
    for (const varName of optionalVars) {
      const value = process.env[varName];
      if (!value) {
        this.addResult({
          name: `ENV_${varName}`,
          status: 'WARN',
          message: `Optional environment variable ${varName} is not set (will use defaults)`
        });
      } else {
        this.addResult({
          name: `ENV_${varName}`,
          status: 'PASS',
          message: `Environment variable ${varName} is set`,
          details: { value: value.substring(0, 50) + (value.length > 50 ? '...' : '') }
        });
      }
    }
  }

  private async testPackageDependencies(): Promise<void> {
    console.log('📦 Testing Package Dependencies...');

    const criticalPackages = [
      '@langchain/langgraph',
      '@langchain/core',
      '@langchain/openai',
      'ioredis',
      'zod',
      'uuid',
      'ws'
    ];

    for (const packageName of criticalPackages) {
      try {
        const pkg = await import(packageName);
        this.addResult({
          name: `PKG_${packageName}`,
          status: 'PASS',
          message: `Package ${packageName} imports successfully`,
          details: { hasDefault: !!pkg.default, keys: Object.keys(pkg).slice(0, 5) }
        });
      } catch (error) {
        this.addResult({
          name: `PKG_${packageName}`,
          status: 'FAIL',
          message: `Package ${packageName} failed to import`,
          details: { error: error instanceof Error ? error.message : 'Unknown error' }
        });
      }
    }
  }

  private async testServiceInitialization(): Promise<void> {
    console.log('🔧 Testing Service Initialization...');

    try {
      // Initialize Redis Context Service
      this.contextService = new RedisContextService(process.env.REDIS_URL || 'redis://localhost:6379');
      this.addResult({
        name: 'INIT_RedisContextService',
        status: 'PASS',
        message: 'RedisContextService initialized successfully'
      });
    } catch (error) {
      this.addResult({
        name: 'INIT_RedisContextService',
        status: 'FAIL',
        message: 'RedisContextService initialization failed',
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      });
      return; // Can't continue without context service
    }

    try {
      // Initialize Tool Registry
      this.toolRegistry = new ToolRegistry(this.contextService);
      this.addResult({
        name: 'INIT_ToolRegistry',
        status: 'PASS',
        message: 'ToolRegistry initialized successfully'
      });
    } catch (error) {
      this.addResult({
        name: 'INIT_ToolRegistry',
        status: 'FAIL',
        message: 'ToolRegistry initialization failed',
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      });
    }

    try {
      // Initialize Tool Executor
      this.toolExecutor = new ToolExecutor(this.toolRegistry!, this.contextService);
      this.addResult({
        name: 'INIT_ToolExecutor',
        status: 'PASS',
        message: 'ToolExecutor initialized successfully'
      });
    } catch (error) {
      this.addResult({
        name: 'INIT_ToolExecutor',
        status: 'FAIL',
        message: 'ToolExecutor initialization failed',
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      });
    }

    try {
      // Initialize Quality Controller
      const qualityController = new QualityController(this.contextService);
      this.addResult({
        name: 'INIT_QualityController',
        status: 'PASS',
        message: 'QualityController initialized successfully'
      });
    } catch (error) {
      this.addResult({
        name: 'INIT_QualityController',
        status: 'FAIL',
        message: 'QualityController initialization failed',
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      });
    }

    try {
      // Initialize LangGraph Orchestrator
      const qualityController = new QualityController(this.contextService);
      const orchestrator = new LangGraphOrchestrator(
        this.toolExecutor!,
        this.toolRegistry!,
        this.contextService,
        qualityController
      );
      this.addResult({
        name: 'INIT_LangGraphOrchestrator',
        status: 'PASS',
        message: 'LangGraphOrchestrator initialized successfully'
      });
    } catch (error) {
      this.addResult({
        name: 'INIT_LangGraphOrchestrator',
        status: 'FAIL',
        message: 'LangGraphOrchestrator initialization failed',
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      });
    }
  }

  private async testRedisIntegration(): Promise<void> {
    console.log('🔴 Testing Redis Integration...');

    if (!this.contextService) {
      this.addResult({
        name: 'REDIS_Integration',
        status: 'FAIL',
        message: 'Cannot test Redis - ContextService not initialized'
      });
      return;
    }

    try {
      // Test Redis health
      const health = await this.contextService.checkHealth();
      if (health.status === 'healthy') {
        this.addResult({
          name: 'REDIS_Health',
          status: 'PASS',
          message: 'Redis health check passed',
          details: health
        });
      } else {
        this.addResult({
          name: 'REDIS_Health',
          status: 'WARN',
          message: 'Redis health check failed (expected for local dev)',
          details: health
        });
      }
    } catch (error) {
      this.addResult({
        name: 'REDIS_Health',
        status: 'WARN',
        message: 'Redis health check failed (expected for local dev)',
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      });
    }

    try {
      // Test context operations
      const testUserId = 'test-integration-user';
      const testTenantId = 'test-tenant';

      await this.contextService.updateUserContext(testUserId, testTenantId, {
        testData: 'integration-test',
        timestamp: new Date().toISOString()
      });

      const context = await this.contextService.getUserContext(testUserId, testTenantId);

      if (context.testData === 'integration-test') {
        this.addResult({
          name: 'REDIS_ContextOperations',
          status: 'PASS',
          message: 'Redis context operations working'
        });
      } else {
        this.addResult({
          name: 'REDIS_ContextOperations',
          status: 'WARN',
          message: 'Redis context operations not working (using fallback)'
        });
      }
    } catch (error) {
      this.addResult({
        name: 'REDIS_ContextOperations',
        status: 'WARN',
        message: 'Redis context operations failed (using fallback)',
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      });
    }
  }

  private async testToolRegistryIntegration(): Promise<void> {
    console.log('🔧 Testing Tool Registry Integration...');

    if (!this.toolRegistry) {
      this.addResult({
        name: 'TOOLS_Registry',
        status: 'FAIL',
        message: 'Cannot test tools - ToolRegistry not initialized'
      });
      return;
    }

    try {
      const allTools = this.toolRegistry.getAllTools();

      if (allTools.length >= 40) {
        this.addResult({
          name: 'TOOLS_Count',
          status: 'PASS',
          message: `Tool registry has ${allTools.length} tools (expected 40+)`
        });
      } else {
        this.addResult({
          name: 'TOOLS_Count',
          status: 'WARN',
          message: `Tool registry has only ${allTools.length} tools (expected 40+)`
        });
      }

      // Test specific critical tools
      const criticalTools = ['searchUnified', 'pinToCanvas', 'createCanvas', 'generateImage'];
      for (const toolName of criticalTools) {
        const tool = this.toolRegistry.getTool(toolName);
        if (tool) {
          this.addResult({
            name: `TOOLS_${toolName}`,
            status: 'PASS',
            message: `Critical tool ${toolName} is available`
          });
        } else {
          this.addResult({
            name: `TOOLS_${toolName}`,
            status: 'FAIL',
            message: `Critical tool ${toolName} is missing`
          });
        }
      }
    } catch (error) {
      this.addResult({
        name: 'TOOLS_Registry',
        status: 'FAIL',
        message: 'Tool registry test failed',
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      });
    }
  }

  private async testLangGraphIntegration(): Promise<void> {
    console.log('🕸️ Testing LangGraph Integration...');

    if (!this.contextService || !this.toolRegistry || !this.toolExecutor) {
      this.addResult({
        name: 'LANGGRAPH_Integration',
        status: 'FAIL',
        message: 'Cannot test LangGraph - dependencies not initialized'
      });
      return;
    }

    try {
      const qualityController = new QualityController(this.contextService);
      const orchestrator = new LangGraphOrchestrator(
        this.toolExecutor,
        this.toolRegistry,
        this.contextService,
        qualityController
      );

      // Test simple workflow execution
      const startTime = Date.now();
      const result = await orchestrator.executeWorkflow(
        'Hello, this is a test message',
        'test-user',
        'test-tenant',
        'test-correlation-id',
        'test',
        { test: true }
      );
      const duration = Date.now() - startTime;

      if (result.success) {
        this.addResult({
          name: 'LANGGRAPH_Execution',
          status: 'PASS',
          message: 'LangGraph workflow execution successful',
          details: { duration, steps: result.totalSteps },
          duration
        });
      } else {
        this.addResult({
          name: 'LANGGRAPH_Execution',
          status: 'FAIL',
          message: 'LangGraph workflow execution failed',
          details: { errors: result.errors, duration },
          duration
        });
      }
    } catch (error) {
      this.addResult({
        name: 'LANGGRAPH_Integration',
        status: 'FAIL',
        message: 'LangGraph integration test failed',
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      });
    }
  }

  private async testAPIEndpoints(): Promise<void> {
    console.log('🌐 Testing API Endpoints...');

    const endpoints = [
      { path: '/api/agent-langgraph?action=health', name: 'LangGraph Agent Health' },
      { path: '/api/agent-langgraph?action=tools', name: 'LangGraph Agent Tools' },
      { path: '/api/tools/test?action=list', name: 'Tools Test List' },
      { path: '/api/quality?action=list-checks', name: 'Quality Checks' },
      { path: '/api/websocket?action=health', name: 'WebSocket Health' }
    ];

    const baseUrl = process.env.PUBLIC_API_BASE_URL || 'http://localhost:3000';

    for (const endpoint of endpoints) {
      try {
        const startTime = Date.now();
        const response = await fetch(`${baseUrl}${endpoint.path}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
        const duration = Date.now() - startTime;

        if (response.ok) {
          const data = await response.json();
          this.addResult({
            name: `API_${endpoint.name.replace(/\s+/g, '_')}`,
            status: 'PASS',
            message: `${endpoint.name} endpoint responded successfully`,
            details: { status: response.status, hasData: !!data },
            duration
          });
        } else {
          this.addResult({
            name: `API_${endpoint.name.replace(/\s+/g, '_')}`,
            status: 'FAIL',
            message: `${endpoint.name} endpoint failed`,
            details: { status: response.status, statusText: response.statusText },
            duration
          });
        }
      } catch (error) {
        this.addResult({
          name: `API_${endpoint.name.replace(/\s+/g, '_')}`,
          status: 'FAIL',
          message: `${endpoint.name} endpoint test failed`,
          details: { error: error instanceof Error ? error.message : 'Unknown error' }
        });
      }
    }
  }

  private async testCompleteWorkflow(): Promise<void> {
    console.log('🔄 Testing Complete Workflow...');

    try {
      const baseUrl = process.env.PUBLIC_API_BASE_URL || 'http://localhost:3000';
      const startTime = Date.now();

      const response = await fetch(`${baseUrl}/api/agent-langgraph`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Search for cyberpunk images and create a small gallery',
          userId: 'integration-test-user',
          tenantId: 'integration-test-tenant',
          workflowType: 'create_gallery'
        })
      });

      const duration = Date.now() - startTime;

      if (response.ok) {
        const data = await response.json();
        this.addResult({
          name: 'WORKFLOW_Complete',
          status: data.success ? 'PASS' : 'WARN',
          message: `Complete workflow test ${data.success ? 'passed' : 'completed with issues'}`,
          details: {
            success: data.success,
            intent: data.intent?.primary_intent,
            steps: data.totalSteps,
            errors: data.errors?.length || 0
          },
          duration
        });
      } else {
        this.addResult({
          name: 'WORKFLOW_Complete',
          status: 'FAIL',
          message: 'Complete workflow test failed',
          details: { status: response.status, statusText: response.statusText },
          duration
        });
      }
    } catch (error) {
      this.addResult({
        name: 'WORKFLOW_Complete',
        status: 'FAIL',
        message: 'Complete workflow test failed',
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      });
    }
  }

  private addResult(result: TestResult): void {
    this.results.push(result);
    const icon = result.status === 'PASS' ? '✅' : result.status === 'WARN' ? '⚠️' : '❌';
    const duration = result.duration ? ` (${result.duration}ms)` : '';
    console.log(`  ${icon} ${result.name}: ${result.message}${duration}`);
  }

  private generateReport(): void {
    console.log('\n' + '='.repeat(80));
    console.log('📊 PRE-DEPLOYMENT INTEGRATION TEST REPORT');
    console.log('='.repeat(80));

    const passed = this.results.filter(r => r.status === 'PASS').length;
    const warned = this.results.filter(r => r.status === 'WARN').length;
    const failed = this.results.filter(r => r.status === 'FAIL').length;
    const total = this.results.length;

    console.log(`\n📈 SUMMARY:`);
    console.log(`  Total Tests: ${total}`);
    console.log(`  ✅ Passed: ${passed}`);
    console.log(`  ⚠️  Warnings: ${warned}`);
    console.log(`  ❌ Failed: ${failed}`);
    console.log(`  Success Rate: ${((passed / total) * 100).toFixed(1)}%`);

    if (failed > 0) {
      console.log(`\n❌ CRITICAL FAILURES:`);
      this.results
        .filter(r => r.status === 'FAIL')
        .forEach(r => {
          console.log(`  • ${r.name}: ${r.message}`);
          if (r.details) {
            console.log(`    Details: ${JSON.stringify(r.details, null, 2)}`);
          }
        });
    }

    if (warned > 0) {
      console.log(`\n⚠️  WARNINGS:`);
      this.results
        .filter(r => r.status === 'WARN')
        .forEach(r => {
          console.log(`  • ${r.name}: ${r.message}`);
        });
    }

    console.log(`\n🎯 DEPLOYMENT READINESS:`);
    if (failed === 0) {
      console.log(`  ✅ READY FOR DEPLOYMENT`);
      console.log(`  All critical tests passed. Warnings are acceptable for initial deployment.`);
    } else {
      console.log(`  ❌ NOT READY FOR DEPLOYMENT`);
      console.log(`  ${failed} critical issues must be resolved before deployment.`);
    }

    console.log('\n' + '='.repeat(80));
  }
}

// Run the tests
async function main() {
  const tester = new PreDeploymentTester();
  await tester.runAllTests();
}

if (require.main === module) {
  main().catch(console.error);
}
