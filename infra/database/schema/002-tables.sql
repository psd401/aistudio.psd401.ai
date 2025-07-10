-- 002-tables.sql: Create all database tables
-- This file creates the complete table structure for the AIStudio application

-- Users table: Core user information synced from AWS Cognito
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    cognito_sub VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255),
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_sign_in_at TIMESTAMP,
    old_clerk_id VARCHAR(255) UNIQUE -- For migration from Clerk
);

-- Roles table: Define user roles for authorization
CREATE TABLE IF NOT EXISTS roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_system BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User roles junction table: Many-to-many relationship between users and roles
CREATE TABLE IF NOT EXISTS user_roles (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    role_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, role_id)
);

-- AI Models table: Available AI models for conversations
CREATE TABLE IF NOT EXISTS ai_models (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    model_id TEXT UNIQUE NOT NULL,
    provider TEXT NOT NULL,
    description TEXT,
    capabilities TEXT,
    max_tokens INTEGER,
    active BOOLEAN DEFAULT true,
    chat_enabled BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tools table: Define available tools/features in the system
CREATE TABLE IF NOT EXISTS tools (
    id SERIAL PRIMARY KEY,
    identifier VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    url VARCHAR(255),
    icon VARCHAR(100),
    is_active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    prompt_chain_tool_id INTEGER,
    parent_navigation_id INTEGER,
    display_order INTEGER DEFAULT 0
);

-- Role tools junction table: Which roles have access to which tools
CREATE TABLE IF NOT EXISTS role_tools (
    id SERIAL PRIMARY KEY,
    role_id INTEGER NOT NULL,
    tool_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(role_id, tool_id)
);

-- Navigation items table: Menu structure and navigation hierarchy
CREATE TABLE IF NOT EXISTS navigation_items (
    id SERIAL PRIMARY KEY,
    label TEXT NOT NULL,
    icon TEXT NOT NULL,
    link TEXT,
    parent_id INTEGER,
    tool_id INTEGER,
    requires_role TEXT,
    position INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    description TEXT,
    type navigation_type DEFAULT 'link'
);

-- Assistant architects table: AI assistant configurations
CREATE TABLE IF NOT EXISTS assistant_architects (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    identifier VARCHAR(255) NOT NULL,
    instructions TEXT,
    tools JSONB DEFAULT '[]'::jsonb,
    data_sources JSONB DEFAULT '[]'::jsonb,
    user_id INTEGER NOT NULL,
    status tool_status DEFAULT 'draft',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    tool_choice VARCHAR(50),
    model_override VARCHAR(100),
    submit_on_enter BOOLEAN DEFAULT true,
    is_public BOOLEAN DEFAULT false,
    submit_text_override VARCHAR(100),
    description_override TEXT,
    temperature NUMERIC(3, 2) DEFAULT 0.7,
    top_p NUMERIC(3, 2) DEFAULT 1.0,
    max_tokens INTEGER,
    presence_penalty NUMERIC(3, 2) DEFAULT 0.0,
    frequency_penalty NUMERIC(3, 2) DEFAULT 0.0,
    placeholder_override VARCHAR(255)
);

-- Chain prompts table: Multi-step prompt configurations
CREATE TABLE IF NOT EXISTS chain_prompts (
    id SERIAL PRIMARY KEY,
    assistant_architect_id INTEGER NOT NULL,
    order_index INTEGER NOT NULL,
    prompt TEXT NOT NULL,
    model_id INTEGER,
    temperature NUMERIC(3, 2) DEFAULT 0.7,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    output_variable VARCHAR(100),
    parse_json BOOLEAN DEFAULT false,
    system_prompt TEXT,
    max_tokens INTEGER,
    is_final BOOLEAN DEFAULT false
);

-- Tool input fields table: Dynamic form fields for tools
CREATE TABLE IF NOT EXISTS tool_input_fields (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    assistant_architect_id INTEGER NOT NULL,
    name VARCHAR(100) NOT NULL,
    label VARCHAR(255) NOT NULL,
    field_type field_type NOT NULL,
    position INTEGER DEFAULT 0,
    options JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Tool executions table: Track tool usage
CREATE TABLE IF NOT EXISTS tool_executions (
    id SERIAL PRIMARY KEY,
    assistant_architect_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    status execution_status DEFAULT 'pending',
    input_values JSONB,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    error_message TEXT,
    execution_time_ms INTEGER
);

-- Prompt results table: Store results from prompt executions
CREATE TABLE IF NOT EXISTS prompt_results (
    id SERIAL PRIMARY KEY,
    execution_id INTEGER NOT NULL,
    prompt_id INTEGER NOT NULL,
    result TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    token_usage JSONB,
    model_used VARCHAR(100)
);

-- Tool edits table: Track edits to tools
CREATE TABLE IF NOT EXISTS tool_edits (
    id SERIAL PRIMARY KEY,
    assistant_architect_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    edit_summary TEXT,
    changes_made JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Conversations table: Chat conversation containers
CREATE TABLE IF NOT EXISTS conversations (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    title VARCHAR(255),
    user_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    metadata JSONB,
    source VARCHAR(50) DEFAULT 'chat',
    deleted_at TIMESTAMP,
    model_id INTEGER,
    execution_id INTEGER
);

-- Messages table: Individual chat messages
CREATE TABLE IF NOT EXISTS messages (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    conversation_id VARCHAR(36) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    metadata JSONB,
    token_count INTEGER,
    model_used VARCHAR(100)
);

-- Documents table: File uploads and document management
CREATE TABLE IF NOT EXISTS documents (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    conversation_id VARCHAR(36),
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(50),
    file_size_bytes BIGINT,
    s3_key VARCHAR(500) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    metadata JSONB,
    processing_status VARCHAR(50) DEFAULT 'pending',
    processed_at TIMESTAMP
);

-- Document chunks table: Processed document segments for RAG
CREATE TABLE IF NOT EXISTS document_chunks (
    id SERIAL PRIMARY KEY,
    document_id INTEGER NOT NULL,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding_vector REAL[],
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Jobs table: Background job tracking
CREATE TABLE IF NOT EXISTS jobs (
    id SERIAL PRIMARY KEY,
    job_type VARCHAR(100) NOT NULL,
    status job_status DEFAULT 'pending',
    user_id INTEGER,
    input_data JSONB,
    output_data JSONB,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3
);

-- Ideas table: Feature request and idea tracking
CREATE TABLE IF NOT EXISTS ideas (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    status VARCHAR(50) DEFAULT 'active',
    priority_level VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    completed_at TIMESTAMP,
    completed_by TEXT
);

-- Idea votes table: Track user votes on ideas
CREATE TABLE IF NOT EXISTS idea_votes (
    id SERIAL PRIMARY KEY,
    idea_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE(idea_id, user_id)
);

-- Idea notes table: Comments and notes on ideas
CREATE TABLE IF NOT EXISTS idea_notes (
    id SERIAL PRIMARY KEY,
    idea_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    note TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Settings table: System configuration key-value pairs
CREATE TABLE IF NOT EXISTS settings (
    id SERIAL PRIMARY KEY,
    key VARCHAR(255) UNIQUE NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    category VARCHAR(100),
    is_secret BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Migration log table: Track database migrations
CREATE TABLE IF NOT EXISTS migration_log (
    id SERIAL PRIMARY KEY,
    migration_name VARCHAR(255) NOT NULL,
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    execution_time_ms INTEGER,
    success BOOLEAN DEFAULT true,
    error_message TEXT
);

-- Migration mappings table: Track ID mappings during migrations
CREATE TABLE IF NOT EXISTS migration_mappings (
    table_name VARCHAR(100) NOT NULL,
    old_id TEXT NOT NULL,
    new_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    PRIMARY KEY (table_name, old_id)
);