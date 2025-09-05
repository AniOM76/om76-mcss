-- migrations/001_initial_schema.sql
-- OM76.MCSS Database Schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Calendar configurations for OM76.MCSS
CREATE TABLE IF NOT EXISTS mcss_calendar_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    calendar_id VARCHAR(255) UNIQUE NOT NULL,
    calendar_name VARCHAR(255),
    calendar_alias VARCHAR(20), -- 'Calendar 01', 'Calendar 02', etc.
    access_token TEXT,
    refresh_token TEXT,
    webhook_id VARCHAR(255),
    webhook_resource_id VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Event mappings for OM76.MCSS sync tracking
CREATE TABLE IF NOT EXISTS mcss_event_mappings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    original_event_id VARCHAR(255) NOT NULL,
    original_calendar_id VARCHAR(255) NOT NULL,
    original_summary TEXT,
    event_start TIMESTAMP WITH TIME ZONE,
    event_end TIMESTAMP WITH TIME ZONE,
    sync_status VARCHAR(20) DEFAULT 'pending', -- pending, completed, failed
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(original_event_id, original_calendar_id)
);

-- Block events created by OM76.MCSS
CREATE TABLE IF NOT EXISTS mcss_block_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mapping_id UUID REFERENCES mcss_event_mappings(id) ON DELETE CASCADE,
    block_event_id VARCHAR(255) NOT NULL,
    target_calendar_id VARCHAR(255) NOT NULL,
    block_title VARCHAR(255), -- "Calendar 01 Block", etc.
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(block_event_id, target_calendar_id)
);

-- OM76.MCSS system logs
CREATE TABLE IF NOT EXISTS mcss_sync_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type VARCHAR(50), -- 'webhook_received', 'block_created', 'sync_completed'
    calendar_id VARCHAR(255),
    event_id VARCHAR(255),
    status VARCHAR(20), -- 'success', 'error', 'warning'
    message TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for OM76.MCSS performance
CREATE INDEX IF NOT EXISTS idx_mcss_original_event ON mcss_event_mappings(original_event_id);
CREATE INDEX IF NOT EXISTS idx_mcss_original_calendar ON mcss_event_mappings(original_calendar_id);
CREATE INDEX IF NOT EXISTS idx_mcss_mapping_blocks ON mcss_block_events(mapping_id);
CREATE INDEX IF NOT EXISTS idx_mcss_calendar_active ON mcss_calendar_configs(calendar_id, is_active);
CREATE INDEX IF NOT EXISTS idx_mcss_sync_logs_calendar ON mcss_sync_logs(calendar_id, created_at);
CREATE INDEX IF NOT EXISTS idx_mcss_sync_logs_type ON mcss_sync_logs(event_type, created_at);