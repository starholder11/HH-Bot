import { NextRequest, NextResponse } from 'next/server';
import { RedisContextService } from '../../../services/context/RedisContextService';
import { QualityController } from '../../../services/quality/QualityController';

export const dynamic = 'force-dynamic';

// Initialize services
const contextService = new RedisContextService(process.env.REDIS_URL || 'redis://localhost:6379');
const qualityController = new QualityController(contextService);

export async function POST(request: NextRequest) {
  const correlationId = contextService.generateCorrelationId();
  console.log(`[${correlationId}] Quality assessment request received`);

  try {
    const body = await request.json();
    const { 
      action,
      targetType,
      targetId,
      targetData,
      userId = 'test-user',
      tenantId = 'default'
    } = body;

    switch (action) {
      case 'assess':
        if (!targetType || !targetId || !targetData) {
          return NextResponse.json(
            { error: 'targetType, targetId, and targetData are required for assessment', correlationId },
            { status: 400 }
          );
        }

        const assessment = await qualityController.assessQuality(
          targetType,
          targetId,
          targetData,
          userId,
          tenantId,
          correlationId
        );

        return NextResponse.json({
          success: true,
          assessment,
          correlationId
        });

      case 'update-standards':
        const { standards } = body;
        if (!standards) {
          return NextResponse.json(
            { error: 'standards object is required', correlationId },
            { status: 400 }
          );
        }

        await qualityController.updateUserStandards(userId, tenantId, standards);

        return NextResponse.json({
          success: true,
          message: 'Quality standards updated',
          correlationId
        });

      default:
        return NextResponse.json(
          {
            error: 'Invalid action. Available actions: assess, update-standards',
            correlationId
          },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error(`[${correlationId}] Quality POST failed:`, error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const correlationId = contextService.generateCorrelationId();
  console.log(`[${correlationId}] Quality GET request received`);

  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const userId = searchParams.get('userId') || 'test-user';
    const tenantId = searchParams.get('tenantId') || 'default';

    switch (action) {
      case 'checks':
        const checks = qualityController.getQualityChecks();
        return NextResponse.json({
          success: true,
          checks: checks.map(check => ({
            id: check.id,
            name: check.name,
            description: check.description,
            category: check.category,
            severity: check.severity,
            enabled: check.enabled
          })),
          correlationId
        });

      case 'history':
        const limit = parseInt(searchParams.get('limit') || '10');
        const history = qualityController.getAssessmentHistory(userId, tenantId, limit);
        
        return NextResponse.json({
          success: true,
          history: history.map(assessment => ({
            id: assessment.id,
            targetType: assessment.targetType,
            targetId: assessment.targetId,
            overallScore: assessment.overallScore,
            overallStatus: assessment.overallStatus,
            timestamp: assessment.timestamp,
            resultsCount: assessment.results.length,
            failedChecks: assessment.results.filter(r => !r.passed).length
          })),
          correlationId
        });

      case 'assessment':
        const assessmentId = searchParams.get('assessmentId');
        if (!assessmentId) {
          return NextResponse.json(
            { error: 'assessmentId is required', correlationId },
            { status: 400 }
          );
        }

        const history2 = qualityController.getAssessmentHistory(userId, tenantId, 100);
        const assessment = history2.find(a => a.id === assessmentId);
        
        if (!assessment) {
          return NextResponse.json(
            { error: 'Assessment not found', correlationId },
            { status: 404 }
          );
        }

        return NextResponse.json({
          success: true,
          assessment,
          correlationId
        });

      case 'stats':
        const stats = qualityController.getQualityStats(userId, tenantId);
        return NextResponse.json({
          success: true,
          stats,
          correlationId
        });

      case 'global-stats':
        const globalStats = qualityController.getQualityStats();
        return NextResponse.json({
          success: true,
          stats: globalStats,
          correlationId
        });

      case 'demo-assessment':
        // Create a demo assessment for testing
        const demoData = {
          workflow: {
            status: 'completed',
            steps: [
              { name: 'Search', status: 'completed' },
              { name: 'Create Canvas', status: 'completed' },
              { name: 'Pin Items', status: 'completed' }
            ]
          },
          searchResults: [
            {
              title: 'Cyberpunk City Art',
              description: 'Futuristic cityscape with neon lights',
              tags: ['cyberpunk', 'city', 'neon', 'futuristic'],
              url: 'https://example.com/art1'
            },
            {
              title: 'Digital Art Collection',
              description: 'Modern digital artwork',
              tags: ['digital', 'art', 'modern'],
              url: 'https://example.com/art2'
            }
          ],
          query: 'cyberpunk art',
          executionTime: 2500,
          response: 'I found some great cyberpunk artwork and created a gallery for you. The canvas includes 2 high-quality images that match your search criteria.',
          apiCalls: [
            { endpoint: '/api/search', status: 200, responseSchema: true, schemaValid: true },
            { endpoint: '/api/canvas', status: 201, responseSchema: true, schemaValid: true }
          ]
        };

        const demoAssessment = await qualityController.assessQuality(
          'workflow',
          'demo-workflow-123',
          demoData,
          userId,
          tenantId,
          correlationId
        );

        return NextResponse.json({
          success: true,
          assessment: demoAssessment,
          message: 'Demo assessment completed',
          correlationId
        });

      default:
        return NextResponse.json(
          {
            error: 'Invalid action. Available actions: checks, history, assessment, stats, global-stats, demo-assessment',
            correlationId
          },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error(`[${correlationId}] Quality GET failed:`, error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId
      },
      { status: 500 }
    );
  }
}
