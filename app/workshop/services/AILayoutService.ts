// AI-Powered Layout Service for Shadow Creation
import { createOpenAI } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';
import type { Layout } from 'react-grid-layout';

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY!
});

// Layout decision schema for AI
const LayoutDecisionSchema = z.object({
  layoutStrategy: z.enum(['hero', 'grid', 'radial', 'timeline', 'cluster']),
  itemLayouts: z.array(z.object({
    id: z.string(),
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
    priority: z.number(),
    reasoning: z.string()
  })),
  overallStrategy: z.string(),
  visualHierarchy: z.array(z.string())
});

export interface ContentItem {
  id: string;
  type: 'image' | 'text' | 'audio' | 'video';
  title: string;
  description: string;
  tags: string[];
  importance: 'high' | 'medium' | 'low';
  size: { width: number; height: number };
}

export class AILayoutService {
  private readonly CELL_SIZE = 20;
  private readonly MARGIN = 8;

  async generateSmartLayout(
    contentItems: ContentItem[],
    containerWidth: number,
    containerHeight: number
  ): Promise<Layout[]> {
    // Step 1: Analyze content with AI
    const contentAnalysis = await this.analyzeContentWithAI(contentItems);

    // Step 2: Generate layout decisions
    const layoutDecision = await this.generateLayoutDecisions(contentAnalysis, {
      containerWidth,
      containerHeight,
      cellSize: this.CELL_SIZE,
      margin: this.MARGIN
    });

    // Step 3: Convert to React Grid Layout format
    return this.convertToRGLFormat(layoutDecision.itemLayouts);
  }

  private async analyzeContentWithAI(contentItems: ContentItem[]) {
    const contentSummary = contentItems.map(item => ({
      id: item.id,
      type: item.type,
      title: item.title,
      description: item.description.substring(0, 200),
      tags: item.tags,
      importance: item.importance
    }));

    const analysisPrompt = `
Analyze these content items for Starholder worldbuilding and determine optimal layout strategy:

CONTENT ITEMS:
${JSON.stringify(contentSummary, null, 2)}

CONTEXT:
- This is for a Starholder timeline entry canvas
- Items represent different aspects of a story/concept
- Layout should tell a visual story and create hierarchy
- Consider narrative relationships between items

Return a layout strategy that:
1. Creates clear visual hierarchy
2. Groups related content
3. Uses appropriate sizing for content types
4. Creates narrative flow
5. Works within responsive constraints
`;

    const result = await generateObject({
      model: openai('gpt-4o') as any,
      schema: z.object({
        contentTypes: z.record(z.array(z.string())),
        relationships: z.array(z.object({
          source: z.string(),
          target: z.string(),
          type: z.string(),
          strength: z.number()
        })),
        layoutStrategy: z.string(),
        keyInsights: z.array(z.string())
      }),
      prompt: analysisPrompt
    });

    return result.object;
  }

  private async generateLayoutDecisions(
    analysis: any,
    constraints: {
      containerWidth: number;
      containerHeight: number;
      cellSize: number;
      margin: number;
    }
  ) {
    const layoutPrompt = `
Based on this content analysis, generate a specific layout:

ANALYSIS:
${JSON.stringify(analysis, null, 2)}

CONSTRAINTS:
- Container: ${constraints.containerWidth}x${constraints.containerHeight}
- Cell Size: ${constraints.cellSize}
- Margin: ${constraints.margin}

Generate positions and sizes for each content item that:
1. Respects the layout strategy identified
2. Creates proper visual hierarchy
3. Groups related items together
4. Uses appropriate sizes for different content types
5. Avoids overlap and respects boundaries

Return detailed positioning for each item.
`;

    const result = await generateObject({
      model: openai('gpt-4o') as any,
      schema: LayoutDecisionSchema,
      prompt: layoutPrompt
    });

    return result.object;
  }

  private convertToRGLFormat(aiLayouts: any[]): Layout[] {
    return aiLayouts.map(layout => ({
      i: layout.id,
      x: layout.x,
      y: layout.y,
      w: layout.w,
      h: layout.h,
      minW: 2,
      minH: 2,
      maxW: 12,
      maxH: 12,
      isDraggable: true,
      isResizable: true
    }));
  }

  // Simple heuristic fallback for when AI fails
  generateFallbackLayout(contentItems: ContentItem[]): Layout[] {
    const layouts: Layout[] = [];
    let currentX = 0;
    let currentY = 0;
    const maxCols = 12;

    contentItems.forEach((item, index) => {
      const width = item.type === 'image' ? 4 : 3;
      const height = item.type === 'text' ? 3 : 4;

      if (currentX + width > maxCols) {
        currentX = 0;
        currentY += 4;
      }

      layouts.push({
        i: item.id,
        x: currentX,
        y: currentY,
        w: width,
        h: height,
        minW: 2,
        minH: 2,
        maxW: 12,
        maxH: 12,
        isDraggable: true,
        isResizable: true
      });

      currentX += width;
    });

    return layouts;
  }
}

// Hook for using AI layout in React components
export function useAILayout() {
  const layoutService = new AILayoutService();

  const generateLayout = async (
    contentItems: ContentItem[],
    containerWidth: number,
    containerHeight: number
  ) => {
    try {
      return await layoutService.generateSmartLayout(
        contentItems,
        containerWidth,
        containerHeight
      );
    } catch (error) {
      console.warn('AI layout failed, using fallback:', error);
      return layoutService.generateFallbackLayout(contentItems);
    }
  };

  return { generateLayout };
}
