import { NextRequest, NextResponse } from 'next/server';
import { RedisContextService } from '../../../services/context/RedisContextService';

// Initialize Redis context service
const contextService = new RedisContextService();

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const tenantId = searchParams.get('tenantId') || 'default';
  const correlationId = contextService.generateCorrelationId();

  console.log(`[${correlationId}] GET /api/context - userId: ${userId}, tenantId: ${tenantId}`);

  if (!userId) {
    return NextResponse.json(
      { error: 'userId parameter is required' },
      { status: 400 }
    );
  }

  try {
    const context = await contextService.getUserContext(userId, tenantId);

    if (!context) {
      return NextResponse.json(
        { error: 'Failed to retrieve user context' },
        { status: 500 }
      );
    }

    console.log(`[${correlationId}] Context retrieved successfully for user: ${userId}`);

    return NextResponse.json({
      success: true,
      context,
      correlationId
    });

  } catch (error) {
    console.error(`[${correlationId}] Error retrieving context:`, error);

    return NextResponse.json(
      {
        error: 'Internal server error',
        correlationId
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const correlationId = contextService.generateCorrelationId();

  try {
    const body = await request.json();
    const { userId, tenantId = 'default', updates } = body;

    console.log(`[${correlationId}] POST /api/context - userId: ${userId}, tenantId: ${tenantId}`);

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      );
    }

    // Get current context
    const currentContext = await contextService.getUserContext(userId, tenantId);

    if (!currentContext) {
      return NextResponse.json(
        { error: 'User context not found' },
        { status: 404 }
      );
    }

    // Apply updates
    if (updates.preferences) {
      currentContext.preferences = { ...currentContext.preferences, ...updates.preferences };
    }

    if (updates.recentSearch) {
      console.log(`[${correlationId}] Adding recent search: ${updates.recentSearch}`);
      try {
        await contextService.addRecentSearch(userId, tenantId, updates.recentSearch);
        console.log(`[${correlationId}] Recent search added successfully`);
      } catch (error) {
        console.error(`[${correlationId}] Error adding recent search:`, error);
        throw error;
      }
    }

    if (updates.sessionEvent) {
      await contextService.recordSessionEvent(
        userId,
        tenantId,
        updates.sessionEvent.type,
        updates.sessionEvent.data,
        updates.sessionEvent.workflowId
      );
    }

    // Update context
    await contextService.updateUserContext(currentContext);

    // Get the updated context to return
    const updatedContext = await contextService.getUserContext(userId, tenantId);

    console.log(`[${correlationId}] Context updated successfully for user: ${userId}`);

    return NextResponse.json({
      success: true,
      context: updatedContext,
      correlationId
    });

  } catch (error) {
    console.error(`[${correlationId}] Error updating context:`, error);

    return NextResponse.json(
      {
        error: 'Internal server error',
        correlationId
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const tenantId = searchParams.get('tenantId') || 'default';
  const correlationId = contextService.generateCorrelationId();

  console.log(`[${correlationId}] DELETE /api/context - userId: ${userId}, tenantId: ${tenantId}`);

  if (!userId) {
    return NextResponse.json(
      { error: 'userId parameter is required' },
      { status: 400 }
    );
  }

  try {
    // For now, we'll just create a fresh context (effectively clearing it)
    const freshContext = await contextService.getUserContext(userId, tenantId);

    if (freshContext) {
      // Clear the arrays but keep the structure
      freshContext.recentSearches = [];
      freshContext.sessionHistory = [];
      freshContext.activeProjects = [];
      freshContext.canvasItems = [];

      await contextService.updateUserContext(freshContext);
    }

    console.log(`[${correlationId}] Context cleared successfully for user: ${userId}`);

    return NextResponse.json({
      success: true,
      message: 'Context cleared',
      correlationId
    });

  } catch (error) {
    console.error(`[${correlationId}] Error clearing context:`, error);

    return NextResponse.json(
      {
        error: 'Internal server error',
        correlationId
      },
      { status: 500 }
    );
  }
}
