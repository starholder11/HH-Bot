import { NextRequest, NextResponse } from 'next/server';
import { WebSocketServer } from 'ws';
import { WebSocketManager } from '../../../services/websocket/WebSocketManager';
import { RedisContextService } from '../../../services/context/RedisContextService';

export const dynamic = 'force-dynamic';

// Initialize services
const contextService = new RedisContextService(process.env.REDIS_URL || 'redis://localhost:6379');
const wsManager = new WebSocketManager(contextService);

// Create WebSocket server (this would typically be done in a separate server file)
let wss: WebSocketServer | null = null;

function initializeWebSocketServer() {
  if (wss) return wss;
  
  wss = new WebSocketServer({ 
    port: 8080,
    path: '/ws'
  });

  wss.on('connection', (socket, request) => {
    wsManager.handleConnection(socket, request);
  });

  console.log('[WebSocket] Server initialized on port 8080');
  return wss;
}

export async function GET(request: NextRequest) {
  const correlationId = contextService.generateCorrelationId();
  console.log(`[${correlationId}] WebSocket API request received`);

  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    switch (action) {
      case 'status':
        // Initialize WebSocket server if not already done
        const server = initializeWebSocketServer();
        const stats = wsManager.getStats();
        
        return NextResponse.json({
          success: true,
          websocket: {
            serverRunning: !!server,
            port: 8080,
            path: '/ws',
            stats
          },
          correlationId
        });

      case 'broadcast':
        const channel = searchParams.get('channel');
        const message = searchParams.get('message');
        
        if (!channel || !message) {
          return NextResponse.json(
            { error: 'channel and message parameters are required', correlationId },
            { status: 400 }
          );
        }

        const sentCount = wsManager.broadcastToChannel(channel, {
          type: 'system_notification',
          payload: { message },
          timestamp: new Date(),
          correlationId
        });

        return NextResponse.json({
          success: true,
          message: `Broadcast sent to ${sentCount} connections`,
          channel,
          sentCount,
          correlationId
        });

      case 'test-workflow-progress':
        const workflowId = searchParams.get('workflowId') || 'test-workflow-123';
        
        // Simulate workflow progress updates
        const progressSteps = [
          { step: 1, total: 3, message: 'Starting workflow...', status: 'running' },
          { step: 2, total: 3, message: 'Processing data...', status: 'running' },
          { step: 3, total: 3, message: 'Finalizing results...', status: 'completed' }
        ];

        // Send progress updates with delays
        setTimeout(() => {
          wsManager.broadcastWorkflowProgress(workflowId, progressSteps[0], correlationId);
        }, 1000);

        setTimeout(() => {
          wsManager.broadcastWorkflowProgress(workflowId, progressSteps[1], correlationId);
        }, 3000);

        setTimeout(() => {
          wsManager.broadcastWorkflowProgress(workflowId, progressSteps[2], correlationId);
          wsManager.broadcastWorkflowComplete(workflowId, {
            message: 'Workflow completed successfully',
            results: { items: 5, duration: '5.2s' }
          }, correlationId);
        }, 5000);

        return NextResponse.json({
          success: true,
          message: 'Test workflow progress initiated',
          workflowId,
          correlationId
        });

      default:
        return NextResponse.json(
          {
            error: 'Invalid action. Available actions: status, broadcast, test-workflow-progress',
            correlationId
          },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error(`[${correlationId}] WebSocket API failed:`, error);
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

export async function POST(request: NextRequest) {
  const correlationId = contextService.generateCorrelationId();
  console.log(`[${correlationId}] WebSocket POST request received`);

  try {
    const body = await request.json();
    const { action, ...params } = body;

    switch (action) {
      case 'broadcast':
        const { channel, message, type = 'system_notification' } = params;
        
        if (!channel || !message) {
          return NextResponse.json(
            { error: 'channel and message are required', correlationId },
            { status: 400 }
          );
        }

        const sentCount = wsManager.broadcastToChannel(channel, {
          type: type as any,
          payload: message,
          timestamp: new Date(),
          correlationId
        });

        return NextResponse.json({
          success: true,
          message: `Broadcast sent to ${sentCount} connections`,
          channel,
          sentCount,
          correlationId
        });

      case 'send-to-user':
        const { userId, tenantId = 'default', message: userMessage } = params;
        
        if (!userId || !userMessage) {
          return NextResponse.json(
            { error: 'userId and message are required', correlationId },
            { status: 400 }
          );
        }

        const userSentCount = wsManager.sendToUser(userId, tenantId, {
          type: 'system_notification',
          payload: userMessage,
          timestamp: new Date(),
          correlationId
        });

        return NextResponse.json({
          success: true,
          message: `Message sent to ${userSentCount} user connections`,
          userId,
          tenantId,
          sentCount: userSentCount,
          correlationId
        });

      case 'workflow-progress':
        const { workflowId, progress } = params;
        
        if (!workflowId || !progress) {
          return NextResponse.json(
            { error: 'workflowId and progress are required', correlationId },
            { status: 400 }
          );
        }

        wsManager.broadcastWorkflowProgress(workflowId, progress, correlationId);

        return NextResponse.json({
          success: true,
          message: 'Workflow progress broadcast',
          workflowId,
          correlationId
        });

      case 'workflow-complete':
        const { workflowId: completeWorkflowId, result } = params;
        
        if (!completeWorkflowId || !result) {
          return NextResponse.json(
            { error: 'workflowId and result are required', correlationId },
            { status: 400 }
          );
        }

        wsManager.broadcastWorkflowComplete(completeWorkflowId, result, correlationId);

        return NextResponse.json({
          success: true,
          message: 'Workflow completion broadcast',
          workflowId: completeWorkflowId,
          correlationId
        });

      case 'workflow-error':
        const { workflowId: errorWorkflowId, error: workflowError } = params;
        
        if (!errorWorkflowId || !workflowError) {
          return NextResponse.json(
            { error: 'workflowId and error are required', correlationId },
            { status: 400 }
          );
        }

        wsManager.broadcastWorkflowError(errorWorkflowId, workflowError, correlationId);

        return NextResponse.json({
          success: true,
          message: 'Workflow error broadcast',
          workflowId: errorWorkflowId,
          correlationId
        });

      default:
        return NextResponse.json(
          {
            error: 'Invalid action. Available actions: broadcast, send-to-user, workflow-progress, workflow-complete, workflow-error',
            correlationId
          },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error(`[${correlationId}] WebSocket POST failed:`, error);
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
