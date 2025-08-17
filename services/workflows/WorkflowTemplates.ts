export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: 'creative' | 'organization' | 'analysis' | 'management';
  tags: string[];
  steps: WorkflowStep[];
  estimatedDuration: number; // in seconds
  complexity: 'simple' | 'medium' | 'complex';
  prerequisites?: string[];
}

export interface WorkflowStep {
  id: string;
  name: string;
  toolName: string;
  parameters: any;
  description: string;
  optional?: boolean;
  dependsOn?: string[]; // step IDs this step depends on
  parallelWith?: string[]; // step IDs this can run in parallel with
}

export class WorkflowTemplates {
  private templates: Map<string, WorkflowTemplate> = new Map();

  constructor() {
    this.initializeTemplates();
  }

  private initializeTemplates() {
    // Creative Workflows
    this.addTemplate({
      id: 'create-image-gallery',
      name: 'Create Image Gallery',
      description: 'Search for images, create a canvas, and organize them into a gallery',
      category: 'creative',
      tags: ['images', 'gallery', 'canvas', 'organization'],
      estimatedDuration: 45,
      complexity: 'simple',
      steps: [
        {
          id: 'search-images',
          name: 'Search for Images',
          toolName: 'searchUnified',
          parameters: {
            query: '{{query}}',
            type: 'image',
            limit: '{{limit:10}}'
          },
          description: 'Find relevant images based on search query'
        },
        {
          id: 'create-canvas',
          name: 'Create Canvas',
          toolName: 'createCanvas',
          parameters: {
            name: '{{canvasName:Gallery}}',
            description: 'Auto-generated gallery for {{query}}'
          },
          description: 'Create a new canvas for organizing images',
          dependsOn: ['search-images']
        },
        {
          id: 'pin-images',
          name: 'Pin Images to Canvas',
          toolName: 'pinToCanvas',
          parameters: {
            canvasId: '{{create-canvas.result.id}}',
            items: '{{search-images.result.items}}'
          },
          description: 'Add found images to the canvas',
          dependsOn: ['create-canvas']
        }
      ]
    });

    this.addTemplate({
      id: 'create-video-timeline',
      name: 'Create Video Timeline',
      description: 'Search for videos and create a chronological timeline',
      category: 'creative',
      tags: ['video', 'timeline', 'chronological'],
      estimatedDuration: 60,
      complexity: 'medium',
      steps: [
        {
          id: 'search-videos',
          name: 'Search for Videos',
          toolName: 'searchUnified',
          parameters: {
            query: '{{query}}',
            type: 'video',
            limit: '{{limit:8}}'
          },
          description: 'Find relevant videos'
        },
        {
          id: 'analyze-videos',
          name: 'Analyze Video Metadata',
          toolName: 'analyzeMediaBatch',
          parameters: {
            items: '{{search-videos.result.items}}'
          },
          description: 'Extract metadata for timeline ordering',
          dependsOn: ['search-videos']
        },
        {
          id: 'create-timeline',
          name: 'Create Timeline Layout',
          toolName: 'createLayout',
          parameters: {
            name: '{{timelineName:Video Timeline}}',
            type: 'timeline',
            items: '{{analyze-videos.result.sortedItems}}'
          },
          description: 'Organize videos in chronological order',
          dependsOn: ['analyze-videos']
        }
      ]
    });

    this.addTemplate({
      id: 'project-setup',
      name: 'New Project Setup',
      description: 'Create a new project with initial structure and assets',
      category: 'organization',
      tags: ['project', 'setup', 'organization'],
      estimatedDuration: 30,
      complexity: 'simple',
      steps: [
        {
          id: 'create-project',
          name: 'Create Project',
          toolName: 'createProject',
          parameters: {
            name: '{{projectName}}',
            description: '{{projectDescription}}',
            category: '{{category:general}}'
          },
          description: 'Create the main project container'
        },
        {
          id: 'create-main-canvas',
          name: 'Create Main Canvas',
          toolName: 'createCanvas',
          parameters: {
            name: 'Main Canvas',
            description: 'Primary workspace for {{projectName}}',
            projectId: '{{create-project.result.id}}'
          },
          description: 'Create primary workspace canvas',
          dependsOn: ['create-project']
        },
        {
          id: 'create-assets-canvas',
          name: 'Create Assets Canvas',
          toolName: 'createCanvas',
          parameters: {
            name: 'Asset Library',
            description: 'Asset collection for {{projectName}}',
            projectId: '{{create-project.result.id}}'
          },
          description: 'Create asset organization canvas',
          dependsOn: ['create-project'],
          parallelWith: ['create-main-canvas']
        }
      ]
    });

    this.addTemplate({
      id: 'content-analysis',
      name: 'Content Analysis Report',
      description: 'Analyze existing content and generate insights',
      category: 'analysis',
      tags: ['analysis', 'insights', 'reporting'],
      estimatedDuration: 90,
      complexity: 'complex',
      prerequisites: ['Existing content in system'],
      steps: [
        {
          id: 'gather-content',
          name: 'Gather Content',
          toolName: 'searchUnified',
          parameters: {
            query: '{{analysisScope:*}}',
            limit: 100,
            includeMetadata: true
          },
          description: 'Collect content for analysis'
        },
        {
          id: 'analyze-patterns',
          name: 'Analyze Content Patterns',
          toolName: 'analyzeContentPatterns',
          parameters: {
            content: '{{gather-content.result.items}}',
            analysisType: ['themes', 'formats', 'quality', 'usage']
          },
          description: 'Identify patterns and trends in content',
          dependsOn: ['gather-content']
        },
        {
          id: 'generate-insights',
          name: 'Generate Insights',
          toolName: 'generateInsights',
          parameters: {
            patterns: '{{analyze-patterns.result}}',
            reportFormat: 'detailed'
          },
          description: 'Create actionable insights from analysis',
          dependsOn: ['analyze-patterns']
        },
        {
          id: 'create-report-canvas',
          name: 'Create Report Canvas',
          toolName: 'createCanvas',
          parameters: {
            name: 'Content Analysis Report',
            description: 'Analysis results for {{analysisScope}}'
          },
          description: 'Create canvas for report visualization',
          parallelWith: ['generate-insights']
        },
        {
          id: 'visualize-report',
          name: 'Visualize Report',
          toolName: 'createVisualization',
          parameters: {
            canvasId: '{{create-report-canvas.result.id}}',
            insights: '{{generate-insights.result}}',
            visualizationType: 'dashboard'
          },
          description: 'Create visual representation of insights',
          dependsOn: ['generate-insights', 'create-report-canvas']
        }
      ]
    });

    this.addTemplate({
      id: 'batch-media-processing',
      name: 'Batch Media Processing',
      description: 'Process multiple media files with consistent operations',
      category: 'management',
      tags: ['batch', 'processing', 'media', 'automation'],
      estimatedDuration: 120,
      complexity: 'medium',
      steps: [
        {
          id: 'select-media',
          name: 'Select Media Files',
          toolName: 'searchUnified',
          parameters: {
            query: '{{mediaQuery}}',
            type: '{{mediaType:*}}',
            limit: '{{batchSize:20}}'
          },
          description: 'Select media files for processing'
        },
        {
          id: 'validate-media',
          name: 'Validate Media Files',
          toolName: 'validateMediaBatch',
          parameters: {
            items: '{{select-media.result.items}}',
            checks: ['format', 'size', 'quality']
          },
          description: 'Ensure media files are valid for processing',
          dependsOn: ['select-media']
        },
        {
          id: 'process-media',
          name: 'Process Media Files',
          toolName: 'processMediaBatch',
          parameters: {
            items: '{{validate-media.result.validItems}}',
            operations: '{{operations}}',
            outputFormat: '{{outputFormat}}'
          },
          description: 'Apply processing operations to media files',
          dependsOn: ['validate-media']
        },
        {
          id: 'organize-results',
          name: 'Organize Processed Files',
          toolName: 'createCanvas',
          parameters: {
            name: 'Processed Media - {{timestamp}}',
            description: 'Results from batch processing operation'
          },
          description: 'Create organization structure for results',
          parallelWith: ['process-media']
        },
        {
          id: 'pin-results',
          name: 'Pin Results to Canvas',
          toolName: 'pinToCanvas',
          parameters: {
            canvasId: '{{organize-results.result.id}}',
            items: '{{process-media.result.processedItems}}'
          },
          description: 'Add processed files to organization canvas',
          dependsOn: ['process-media', 'organize-results']
        }
      ]
    });
  }

  private addTemplate(template: WorkflowTemplate) {
    this.templates.set(template.id, template);
  }

  /**
   * Get all available templates
   */
  getAllTemplates(): WorkflowTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Get template by ID
   */
  getTemplate(id: string): WorkflowTemplate | null {
    return this.templates.get(id) || null;
  }

  /**
   * Search templates by category, tags, or complexity
   */
  searchTemplates(criteria: {
    category?: string;
    tags?: string[];
    complexity?: string;
    query?: string;
  }): WorkflowTemplate[] {
    const templates = Array.from(this.templates.values());

    return templates.filter(template => {
      if (criteria.category && template.category !== criteria.category) {
        return false;
      }

      if (criteria.complexity && template.complexity !== criteria.complexity) {
        return false;
      }

      if (criteria.tags && criteria.tags.length > 0) {
        const hasMatchingTag = criteria.tags.some(tag =>
          template.tags.includes(tag.toLowerCase())
        );
        if (!hasMatchingTag) return false;
      }

      if (criteria.query) {
        const query = criteria.query.toLowerCase();
        const searchText = `${template.name} ${template.description} ${template.tags.join(' ')}`.toLowerCase();
        if (!searchText.includes(query)) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Get templates suitable for a given intent
   */
  getTemplatesForIntent(intent: string, context?: any): WorkflowTemplate[] {
    const intentLower = intent.toLowerCase();

    // Simple intent matching - could be enhanced with ML
    if (intentLower.includes('gallery') || intentLower.includes('images')) {
      return [this.getTemplate('create-image-gallery')!].filter(Boolean);
    }

    if (intentLower.includes('video') && intentLower.includes('timeline')) {
      return [this.getTemplate('create-video-timeline')!].filter(Boolean);
    }

    if (intentLower.includes('project') && intentLower.includes('create')) {
      return [this.getTemplate('project-setup')!].filter(Boolean);
    }

    if (intentLower.includes('analyze') || intentLower.includes('analysis')) {
      return [this.getTemplate('content-analysis')!].filter(Boolean);
    }

    if (intentLower.includes('batch') || intentLower.includes('process')) {
      return [this.getTemplate('batch-media-processing')!].filter(Boolean);
    }

    // Return general templates if no specific match
    return this.searchTemplates({ complexity: 'simple' }).slice(0, 3);
  }

  /**
   * Instantiate a template with specific parameters
   */
  instantiateTemplate(
    templateId: string,
    parameters: { [key: string]: any }
  ): WorkflowStep[] | null {
    const template = this.getTemplate(templateId);
    if (!template) return null;

    return template.steps.map(step => ({
      ...step,
      parameters: this.resolveParameters(step.parameters, parameters)
    }));
  }

  /**
   * Resolve template parameters with actual values
   */
  private resolveParameters(
    templateParams: any,
    actualParams: { [key: string]: any }
  ): any {
    if (typeof templateParams === 'string') {
      return this.resolveParameterString(templateParams, actualParams);
    }

    if (Array.isArray(templateParams)) {
      return templateParams.map(item => this.resolveParameters(item, actualParams));
    }

    if (typeof templateParams === 'object' && templateParams !== null) {
      const resolved: any = {};
      for (const [key, value] of Object.entries(templateParams)) {
        resolved[key] = this.resolveParameters(value, actualParams);
      }
      return resolved;
    }

    return templateParams;
  }

  /**
   * Resolve parameter placeholders in strings
   */
  private resolveParameterString(template: string, params: { [key: string]: any }): any {
    // Handle {{key}} and {{key:default}} patterns
    return template.replace(/\{\{([^}]+)\}\}/g, (match, content) => {
      const [key, defaultValue] = content.split(':');

      if (params.hasOwnProperty(key)) {
        return params[key];
      }

      if (defaultValue !== undefined) {
        return defaultValue;
      }

      // Return placeholder if no value found
      return match;
    });
  }

  /**
   * Validate template parameters
   */
  validateTemplateParameters(
    templateId: string,
    parameters: { [key: string]: any }
  ): { valid: boolean; missing: string[]; errors: string[] } {
    const template = this.getTemplate(templateId);
    if (!template) {
      return { valid: false, missing: [], errors: ['Template not found'] };
    }

    const missing: string[] = [];
    const errors: string[] = [];

    // Extract required parameters from template
    const requiredParams = this.extractRequiredParameters(template);

    for (const param of requiredParams) {
      if (!parameters.hasOwnProperty(param)) {
        missing.push(param);
      }
    }

    return {
      valid: missing.length === 0 && errors.length === 0,
      missing,
      errors
    };
  }

  /**
   * Extract required parameters from template steps
   */
  private extractRequiredParameters(template: WorkflowTemplate): string[] {
    const params = new Set<string>();

    const extractFromValue = (value: any) => {
      if (typeof value === 'string') {
        const matches = value.match(/\{\{([^:}]+)/g);
        if (matches) {
          matches.forEach(match => {
            const param = match.replace('{{', '');
            params.add(param);
          });
        }
      } else if (typeof value === 'object' && value !== null) {
        Object.values(value).forEach(extractFromValue);
      }
    };

    template.steps.forEach(step => {
      extractFromValue(step.parameters);
    });

    return Array.from(params);
  }
}
