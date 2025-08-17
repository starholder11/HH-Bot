-- Workflow Events Table
CREATE TABLE IF NOT EXISTS workflow_events (
    id SERIAL PRIMARY KEY,
    execution_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB,
    correlation_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_workflow_events_execution_id ON workflow_events(execution_id);
CREATE INDEX IF NOT EXISTS idx_workflow_events_correlation_id ON workflow_events(correlation_id);
CREATE INDEX IF NOT EXISTS idx_workflow_events_event_type ON workflow_events(event_type);
CREATE INDEX IF NOT EXISTS idx_workflow_events_created_at ON workflow_events(created_at);

-- User Context Backup Table (optional - Redis is primary)
CREATE TABLE IF NOT EXISTS user_context_backup (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    tenant_id VARCHAR(255) NOT NULL,
    context_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_context_backup_user_tenant
ON user_context_backup(user_id, tenant_id);

-- Workflow Execution Summary Table (for reporting)
CREATE TABLE IF NOT EXISTS workflow_executions (
    id SERIAL PRIMARY KEY,
    execution_id VARCHAR(255) UNIQUE NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    tenant_id VARCHAR(255) NOT NULL,
    workflow_type VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL,
    correlation_id VARCHAR(255) NOT NULL,
    input_data JSONB,
    output_data JSONB,
    error_details JSONB,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_workflow_executions_user_tenant ON workflow_executions(user_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_status ON workflow_executions(status);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow_type ON workflow_executions(workflow_type);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_correlation_id ON workflow_executions(correlation_id);
