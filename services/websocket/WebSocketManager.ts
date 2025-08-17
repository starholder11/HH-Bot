import { WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { RedisContextService } from '../context/RedisContextService';

export interface WebSocketConnection {
  id: string;
  userId: string;
  tenantId: string;
  socket: WebSocket;
  subscriptions: Set<string>;
  lastActivity: Date;
}

export interface WebSocketMessage {
  type: 'workflow_progress' | 'workflow_complete' | 'workflow_error' | 'context_update' | 'system_notification';
  payload: any;
  timestamp: Date;
  correlationId?: string;
}

export class WebSocketManager {
  private connections: Map<string, WebSocketConnection> = new Map();
  private contextService: RedisContextService;
  private heartbeatInterval: NodeJS.Timeout;

  constructor(contextService: RedisContextService) {
    this.contextService = contextService;

    // Start heartbeat to clean up stale connections
    this.heartbeatInterval = setInterval(() => {
      this.cleanupStaleConnections();
    }, 30000); // Every 30 seconds
  }

  /**
   * Handle new WebSocket connection
   */
  handleConnection(socket: WebSocket, request: IncomingMessage) {
    const url = new URL(request.url!, `http://${request.headers.host}`);
    const userId = url.searchParams.get('userId') || 'anonymous';
    const tenantId = url.searchParams.get('tenantId') || 'default';

    const connectionId = this.generateConnectionId();
    const connection: WebSocketConnection = {
      id: connectionId,
      userId,
      tenantId,
      socket,
      subscriptions: new Set(),
      lastActivity: new Date()
    };

    this.connections.set(connectionId, connection);
    console.log(`[WebSocket] New connection: ${connectionId} (User: ${userId})`);

    // Set up event handlers
    socket.on('message', (data) => {
      this.handleMessage(connectionId, data);
    });

    socket.on('close', () => {
      this.handleDisconnection(connectionId);
    });

    socket.on('error', (error) => {
      console.error(`[WebSocket] Connection ${connectionId} error:`, error);
      this.handleDisconnection(connectionId);
    });

    // Send welcome message
    this.sendToConnection(connectionId, {
      type: 'system_notification',
      payload: {
        message: 'Connected to HH-Bot real-time updates',
        connectionId,
        timestamp: new Date()
      },
      timestamp: new Date()
    });

    return connectionId;
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(connectionId: string, data: any) {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    connection.lastActivity = new Date();

    try {
      const message = JSON.parse(data.toString());
      console.log(`[WebSocket] Message from ${connectionId}:`, message);

      switch (message.type) {
        case 'subscribe':
          this.handleSubscription(connectionId, message.payload);
          break;
        case 'unsubscribe':
          this.handleUnsubscription(connectionId, message.payload);
          break;
        case 'ping':
          this.sendToConnection(connectionId, {
            type: 'system_notification',
            payload: { message: 'pong' },
            timestamp: new Date()
          });
          break;
        default:
          console.warn(`[WebSocket] Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error(`[WebSocket] Error parsing message from ${connectionId}:`, error);
    }
  }

  /**
   * Handle subscription requests
   */
  private handleSubscription(connectionId: string, payload: { channels: string[] }) {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    payload.channels.forEach(channel => {
      connection.subscriptions.add(channel);
      console.log(`[WebSocket] ${connectionId} subscribed to ${channel}`);
    });

    this.sendToConnection(connectionId, {
      type: 'system_notification',
      payload: {
        message: `Subscribed to channels: ${payload.channels.join(', ')}`,
        subscriptions: Array.from(connection.subscriptions)
      },
      timestamp: new Date()
    });
  }

  /**
   * Handle unsubscription requests
   */
  private handleUnsubscription(connectionId: string, payload: { channels: string[] }) {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    payload.channels.forEach(channel => {
      connection.subscriptions.delete(channel);
      console.log(`[WebSocket] ${connectionId} unsubscribed from ${channel}`);
    });

    this.sendToConnection(connectionId, {
      type: 'system_notification',
      payload: {
        message: `Unsubscribed from channels: ${payload.channels.join(', ')}`,
        subscriptions: Array.from(connection.subscriptions)
      },
      timestamp: new Date()
    });
  }

  /**
   * Handle connection disconnection
   */
  private handleDisconnection(connectionId: string) {
    const connection = this.connections.get(connectionId);
    if (connection) {
      console.log(`[WebSocket] Connection ${connectionId} disconnected (User: ${connection.userId})`);
      this.connections.delete(connectionId);
    }
  }

  /**
   * Send message to specific connection
   */
  sendToConnection(connectionId: string, message: WebSocketMessage): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection || connection.socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      connection.socket.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error(`[WebSocket] Error sending to ${connectionId}:`, error);
      this.handleDisconnection(connectionId);
      return false;
    }
  }

  /**
   * Broadcast message to all connections subscribed to a channel
   */
  broadcastToChannel(channel: string, message: WebSocketMessage): number {
    let sentCount = 0;

    for (const [connectionId, connection] of Array.from(this.connections.entries())) {
      if (connection.subscriptions.has(channel)) {
        if (this.sendToConnection(connectionId, message)) {
          sentCount++;
        }
      }
    }

    console.log(`[WebSocket] Broadcast to channel ${channel}: ${sentCount} recipients`);
    return sentCount;
  }

  /**
   * Send message to all connections for a specific user
   */
  sendToUser(userId: string, tenantId: string, message: WebSocketMessage): number {
    let sentCount = 0;

    for (const [connectionId, connection] of Array.from(this.connections.entries())) {
      if (connection.userId === userId && connection.tenantId === tenantId) {
        if (this.sendToConnection(connectionId, message)) {
          sentCount++;
        }
      }
    }

    return sentCount;
  }

  /**
   * Broadcast workflow progress update
   */
  broadcastWorkflowProgress(workflowId: string, progress: any, correlationId?: string) {
    const message: WebSocketMessage = {
      type: 'workflow_progress',
      payload: {
        workflowId,
        progress,
        correlationId
      },
      timestamp: new Date(),
      correlationId
    };

    // Broadcast to workflow-specific channel
    this.broadcastToChannel(`workflow:${workflowId}`, message);

    // Also broadcast to general workflow channel
    this.broadcastToChannel('workflows', message);
  }

  /**
   * Broadcast workflow completion
   */
  broadcastWorkflowComplete(workflowId: string, result: any, correlationId?: string) {
    const message: WebSocketMessage = {
      type: 'workflow_complete',
      payload: {
        workflowId,
        result,
        correlationId
      },
      timestamp: new Date(),
      correlationId
    };

    this.broadcastToChannel(`workflow:${workflowId}`, message);
    this.broadcastToChannel('workflows', message);
  }

  /**
   * Broadcast workflow error
   */
  broadcastWorkflowError(workflowId: string, error: any, correlationId?: string) {
    const message: WebSocketMessage = {
      type: 'workflow_error',
      payload: {
        workflowId,
        error,
        correlationId
      },
      timestamp: new Date(),
      correlationId
    };

    this.broadcastToChannel(`workflow:${workflowId}`, message);
    this.broadcastToChannel('workflows', message);
  }

  /**
   * Broadcast context update
   */
  broadcastContextUpdate(userId: string, tenantId: string, contextUpdate: any) {
    const message: WebSocketMessage = {
      type: 'context_update',
      payload: {
        userId,
        tenantId,
        update: contextUpdate
      },
      timestamp: new Date()
    };

    this.sendToUser(userId, tenantId, message);
  }

  /**
   * Get connection statistics
   */
  getStats() {
    const connectionsByUser: { [userId: string]: number } = {};
    const subscriptionCounts: { [channel: string]: number } = {};

    for (const connection of Array.from(this.connections.values())) {
      // Count connections by user
      const userKey = `${connection.userId}:${connection.tenantId}`;
      connectionsByUser[userKey] = (connectionsByUser[userKey] || 0) + 1;

      // Count subscriptions by channel
      for (const channel of Array.from(connection.subscriptions)) {
        subscriptionCounts[channel] = (subscriptionCounts[channel] || 0) + 1;
      }
    }

    return {
      totalConnections: this.connections.size,
      connectionsByUser,
      subscriptionCounts,
      activeChannels: Object.keys(subscriptionCounts).length
    };
  }

  /**
   * Clean up stale connections
   */
  private cleanupStaleConnections() {
    const staleThreshold = 5 * 60 * 1000; // 5 minutes
    const now = new Date();
    const staleConnections: string[] = [];

    for (const [connectionId, connection] of Array.from(this.connections.entries())) {
      if (connection.socket.readyState !== WebSocket.OPEN) {
        staleConnections.push(connectionId);
      } else if (now.getTime() - connection.lastActivity.getTime() > staleThreshold) {
        // Send ping to check if connection is still alive
        try {
          connection.socket.ping();
        } catch (error) {
          staleConnections.push(connectionId);
        }
      }
    }

    staleConnections.forEach(connectionId => {
      console.log(`[WebSocket] Cleaning up stale connection: ${connectionId}`);
      this.handleDisconnection(connectionId);
    });

    if (staleConnections.length > 0) {
      console.log(`[WebSocket] Cleaned up ${staleConnections.length} stale connections`);
    }
  }

  /**
   * Generate unique connection ID
   */
  private generateConnectionId(): string {
    return `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Shutdown WebSocket manager
   */
  shutdown() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Close all connections
    for (const [connectionId, connection] of Array.from(this.connections.entries())) {
      try {
        connection.socket.close(1000, 'Server shutdown');
      } catch (error) {
        console.error(`[WebSocket] Error closing connection ${connectionId}:`, error);
      }
    }

    this.connections.clear();
    console.log('[WebSocket] Manager shutdown complete');
  }
}
