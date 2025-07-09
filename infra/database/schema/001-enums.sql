-- 001-enums.sql: Create all enum types used in the database
-- This file creates custom enum types that enforce valid values for specific columns

-- Drop existing types if they exist (for idempotency)
DROP TYPE IF EXISTS tool_status CASCADE;
DROP TYPE IF EXISTS job_status CASCADE;
DROP TYPE IF EXISTS execution_status CASCADE;
DROP TYPE IF EXISTS field_type CASCADE;
DROP TYPE IF EXISTS navigation_type CASCADE;

-- Tool status enum for tracking tool lifecycle
CREATE TYPE tool_status AS ENUM (
    'draft',
    'pending_approval',
    'approved',
    'rejected',
    'disabled'
);

-- Job status enum for background job tracking
CREATE TYPE job_status AS ENUM (
    'pending',
    'running',
    'completed',
    'failed'
);

-- Execution status enum for tool execution tracking
CREATE TYPE execution_status AS ENUM (
    'pending',
    'running',
    'completed',
    'failed'
);

-- Field type enum for tool input fields
CREATE TYPE field_type AS ENUM (
    'short_text',
    'long_text',
    'select',
    'multi_select',
    'file_upload'
);

-- Navigation type enum for navigation items
CREATE TYPE navigation_type AS ENUM (
    'link',
    'section',
    'page'
);