import { openai } from '@ai-sdk/openai';
import { generateObject, generateText } from 'ai';
import { z } from 'zod';

export interface LLMProvider {
  name: string;
  model: any;
  available: boolean;
  lastError?: string;
  costPerToken: number;
  priority: number;
}

export interface LLMRequest {
  prompt: string;
  system?: string;
  schema?: z.ZodSchema;
  temperature?: number;
}

export interface LLMResponse {
  content: string | any;
  provider: string;
  cost: number;
  tokens: number;
  correlationId: string;
}

export class SimpleLLMRouter {
  private providers: LLMProvider[] = [];
  private totalCost = 0;
  private requestCount = 0;

  constructor() {
    this.initializeProviders();
  }

  private initializeProviders() {
    // Primary: GPT-4o Mini (fast and cheap)
    this.providers.push({
      name: 'OpenAI GPT-4o Mini',
      model: openai('gpt-4o-mini'),
      available: true,
      costPerToken: 0.00015 / 1000, // $0.15 per 1M tokens
      priority: 1
    });

    // Fallback: GPT-4o (more capable but expensive)
    this.providers.push({
      name: 'OpenAI GPT-4o',
      model: openai('gpt-4o-2024-08-06'),
      available: true,
      costPerToken: 0.0025 / 1000, // $2.50 per 1M tokens
      priority: 2
    });

    console.log(`[SimpleLLMRouter] Initialized ${this.providers.length} providers`);
  }

  async generateResponse(request: LLMRequest): Promise<LLMResponse> {
    const correlationId = `llm_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    console.log(`[${correlationId}] LLM request: ${request.schema ? 'structured' : 'text'}`);

    // Get available providers sorted by priority
    const availableProviders = this.providers
      .filter(p => p.available)
      .sort((a, b) => a.priority - b.priority);

    if (availableProviders.length === 0) {
      throw new Error('No LLM providers available');
    }

    let lastError: Error | null = null;

    // Try providers in order of priority with simple retry
    for (const provider of availableProviders) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          console.log(`[${correlationId}] Attempting ${provider.name} (attempt ${attempt + 1})`);

          const tokens = this.estimateTokens(request.prompt + (request.system || ''));
          const cost = tokens * provider.costPerToken;

          let content: any;

          if (request.schema) {
            // Structured output
            const result = await generateObject({
              model: provider.model,
              schema: request.schema,
              system: request.system,
              prompt: request.prompt,
              temperature: request.temperature || 0.1,
            });
            content = result.object;
          } else {
            // Text output
            const result = await generateText({
              model: provider.model,
              system: request.system,
              prompt: request.prompt,
              temperature: request.temperature || 0.7,
              maxTokens: 1000,
            });
            content = result.text;
          }

          // Success - update stats and return
          this.totalCost += cost;
          this.requestCount++;
          provider.available = true;
          provider.lastError = undefined;

          console.log(`[${correlationId}] Success with ${provider.name} ($${cost.toFixed(4)})`);

          return {
            content,
            provider: provider.name,
            cost,
            tokens,
            correlationId
          };

        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          console.warn(`[${correlationId}] ${provider.name} attempt ${attempt + 1} failed: ${lastError.message}`);

          // Mark provider as potentially unavailable on repeated failures
          if (attempt === 1) {
            provider.available = false;
            provider.lastError = lastError.message;
          }

          // Wait before retry
          if (attempt === 0) {
            await this.delay(1000);
          }
        }
      }
    }

    // All providers failed
    throw new Error(`All LLM providers failed. Last error: ${lastError?.message}`);
  }

  // Compatibility wrapper: routeRequest(prompt, options)
  async routeRequest(
    prompt: string,
    options?: { correlationId?: string; system?: string; schema?: z.ZodSchema; temperature?: number }
  ): Promise<{ response: any; cost: number }> {
    const res = await this.generateResponse({
      prompt,
      system: options?.system,
      schema: options?.schema,
      temperature: options?.temperature,
    });
    return { response: res.content, cost: res.cost };
  }

  private estimateTokens(text: string): number {
    // Rough estimation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Provider health monitoring
  async checkProviderHealth(): Promise<{ [key: string]: boolean }> {
    const health: { [key: string]: boolean } = {};

    for (const provider of this.providers) {
      try {
        // Simple health check
        await generateText({
          model: provider.model,
          prompt: 'Hello',
          maxTokens: 5,
        });

        provider.available = true;
        provider.lastError = undefined;
        health[provider.name] = true;

      } catch (error) {
        provider.available = false;
        provider.lastError = error instanceof Error ? error.message : 'Unknown error';
        health[provider.name] = false;
      }
    }

    return health;
  }

  // Cost management
  getCostStats() {
    return {
      totalCost: this.totalCost,
      requestCount: this.requestCount,
      averageCost: this.requestCount > 0 ? this.totalCost / this.requestCount : 0,
      dailyProjection: this.totalCost * 24, // Rough daily projection
    };
  }

  getProviderStatus() {
    return this.providers.map(p => ({
      name: p.name,
      available: p.available,
      lastError: p.lastError,
      priority: p.priority,
      costPerToken: p.costPerToken
    }));
  }

  // Cost limits check
  checkCostLimits(dailyLimit: number = 10): { exceeded: boolean; warning: boolean } {
    const stats = this.getCostStats();

    return {
      exceeded: stats.dailyProjection > dailyLimit,
      warning: stats.dailyProjection > dailyLimit * 0.8
    };
  }

  resetCostTracking() {
    this.totalCost = 0;
    this.requestCount = 0;
  }
}
