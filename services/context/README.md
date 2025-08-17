# Redis Context Service

The Redis Context Service provides centralized state management for user sessions, workflow execution, and application context using Redis as the primary data store.

## Features

- **User Context Management**: Session state, preferences, recent searches, and activity history
- **Workflow State Tracking**: Execution status, results, and error handling
- **Tenant Isolation**: Multi-tenant support with proper data isolation
- **TTL Policies**: Automatic cleanup of expired data
- **Correlation ID Tracing**: Full request traceability
- **Health Monitoring**: Service health checks and diagnostics

## Architecture

### User Context
- Stored in Redis with 24-hour TTL
- Includes session data, preferences, recent searches, and activity history
- Automatically creates default context for new users
- Limits array sizes to prevent memory bloat

### Workflow State
- Stored in Redis with 7-day TTL
- Tracks execution status, current step, results, and errors
- Supports pause/resume functionality
- Includes correlation IDs for tracing

### Data Keys
- User Context: `context:{tenantId}:{userId}`
- Workflow State: `workflow:{executionId}`

## Usage

### Initialize Service
```typescript
import { RedisContextService } from './services/context/RedisContextService';

const contextService = new RedisContextService('redis://localhost:6379');
```

### User Context Operations
```typescript
// Get user context (creates default if not exists)
const context = await contextService.getUserContext('user123', 'tenant1');

// Update context
await contextService.updateUserContext(context);

// Add recent search
await contextService.addRecentSearch('user123', 'tenant1', 'search query');

// Record session event
await contextService.recordSessionEvent(
  'user123',
  'tenant1',
  'page_view',
  { page: '/dashboard' }
);
```

### Workflow Operations
```typescript
// Create workflow state
const workflowState = await contextService.createWorkflowState(
  'user123',
  'tenant1',
  'create_video',
  'corr_123',
  { videoType: 'cyberpunk' }
);

// Update workflow state
workflowState.status = 'running';
await contextService.updateWorkflowState(workflowState);

// Get workflow state
const state = await contextService.getWorkflowState('workflow_123');
```

### Correlation IDs
```typescript
// Generate correlation ID for request tracing
const correlationId = contextService.generateCorrelationId();
console.log(`[${correlationId}] Processing request...`);
```

## API Endpoints

### Context Management
- `GET /api/context?userId=123&tenantId=default` - Get user context
- `POST /api/context` - Update user context
- `DELETE /api/context?userId=123&tenantId=default` - Clear user context

### Health Check
- `GET /api/health/redis` - Redis service health status

### Workflow Testing
- `POST /api/workflow/test` - Execute test workflow
- `GET /api/workflow/test?executionId=123` - Get workflow status

## Configuration

Set these environment variables:

```bash
REDIS_URL=redis://localhost:6379
DATABASE_URL=postgresql://localhost:5432/hhbot
WORKFLOW_TTL_DAYS=7
CONTEXT_TTL_HOURS=24
SESSION_HISTORY_LIMIT=100
RECENT_SEARCHES_LIMIT=20
```

## Database Schema

Run the setup script to create required tables:

```sql
-- See scripts/setup-workflow-db.sql
```

## Error Handling

The service includes comprehensive error handling:
- Redis connection failures
- Data serialization errors
- TTL expiration handling
- Graceful degradation

## Monitoring

Health check endpoint provides:
- Connection status
- Key count
- Memory usage
- Error details

## Testing

Test the service with curl:

```bash
# Health check
curl http://localhost:3000/api/health/redis

# Get user context
curl "http://localhost:3000/api/context?userId=test&tenantId=default"

# Run test workflow
curl -X POST http://localhost:3000/api/workflow/test \
  -H "Content-Type: application/json" \
  -d '{"testParam": "Hello World"}'
```

## Performance Considerations

- Redis keys include TTL to prevent memory leaks
- Array sizes are limited to prevent bloat
- Connection pooling for database operations
- Correlation IDs for performance tracing

## Future Enhancements

- Redis Cluster support for high availability
- Backup/restore functionality
- Advanced analytics and reporting
- Real-time event streaming
