-- 002-tables.sql: Create all database tables
-- This file creates the ACTUAL table structure as it exists in the June 2025 database

-- Users table: Core user information synced from AWS Cognito
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    cognito_sub VARCHAR(255) UNIQUE,
    email VARCHAR(255),
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    last_sign_in_at TIMESTAMP,
    old_clerk_id VARCHAR(255) UNIQUE
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
    user_id INTEGER,
    role_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
    updated_at TIMESTAMP
);

-- Tools table: Define available tools/features in the system (ACTUAL STRUCTURE)
CREATE TABLE IF NOT EXISTS tools (
    id SERIAL PRIMARY KEY,
    identifier VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    prompt_chain_tool_id INTEGER
);

-- Role tools junction table: Which roles have access to which tools
CREATE TABLE IF NOT EXISTS role_tools (
    id SERIAL PRIMARY KEY,
    role_id INTEGER,
    tool_id INTEGER,
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

-- Assistant architects table: AI assistant configurations (ACTUAL STRUCTURE)
CREATE TABLE IF NOT EXISTS assistant_architects (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    status tool_status DEFAULT 'draft',
    is_parallel BOOLEAN DEFAULT false,
    timeout_seconds INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    image_path TEXT,
    user_id INTEGER
);

-- Chain prompts table: Multi-step prompt configurations (ACTUAL STRUCTURE)
CREATE TABLE IF NOT EXISTS chain_prompts (
    id SERIAL PRIMARY KEY,
    assistant_architect_id INTEGER,
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    model_id INTEGER NOT NULL,
    position INTEGER DEFAULT 0 NOT NULL,
    parallel_group INTEGER,
    input_mapping JSONB,
    timeout_seconds INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    system_context TEXT
);

-- Tool input fields table: Dynamic form fields for tools
CREATE TABLE IF NOT EXISTS tool_input_fields (
    id SERIAL PRIMARY KEY,
    assistant_architect_id INTEGER,
    name TEXT NOT NULL,
    label TEXT DEFAULT '' NOT NULL,
    field_type field_type NOT NULL,
    position INTEGER DEFAULT 0,
    options JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Tool executions table: Track tool usage
CREATE TABLE IF NOT EXISTS tool_executions (
    id SERIAL PRIMARY KEY,
    assistant_architect_id INTEGER,
    user_id INTEGER NOT NULL,
    status execution_status DEFAULT 'pending',
    input_data JSONB NOT NULL,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    error_message TEXT
);

-- Prompt results table: Store results from prompt executions
CREATE TABLE IF NOT EXISTS prompt_results (
    id SERIAL PRIMARY KEY,
    execution_id INTEGER,
    prompt_id INTEGER,
    input_data JSONB NOT NULL,
    output_data TEXT,
    status execution_status DEFAULT 'pending',
    error_message TEXT,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    execution_time_ms INTEGER,
    user_feedback TEXT
);

-- Tool edits table: Track edits to tools
CREATE TABLE IF NOT EXISTS tool_edits (
    id SERIAL PRIMARY KEY,
    assistant_architect_id INTEGER,
    user_id INTEGER,
    changes JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Conversations table: Chat conversation containers (ACTUAL STRUCTURE)
CREATE TABLE IF NOT EXISTS conversations (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    source TEXT DEFAULT 'chat',
    context JSONB,
    user_id INTEGER,
    execution_id INTEGER,
    model_id INTEGER
);

-- Messages table: Individual chat messages (ACTUAL STRUCTURE)
CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Documents table: File uploads and document management
CREATE TABLE IF NOT EXISTS documents (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    conversation_id INTEGER,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    size INTEGER NOT NULL,
    url TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Document chunks table: Processed document segments for RAG
CREATE TABLE IF NOT EXISTS document_chunks (
    id SERIAL PRIMARY KEY,
    document_id INTEGER,
    content TEXT NOT NULL,
    embedding JSONB,
    metadata JSONB,
    page_number INTEGER,
    chunk_index INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Jobs table: Background job tracking (ACTUAL STRUCTURE with status!)
CREATE TABLE IF NOT EXISTS jobs (
    id SERIAL PRIMARY KEY,
    type TEXT NOT NULL,
    status job_status DEFAULT 'pending',
    user_id INTEGER NOT NULL,
    input TEXT NOT NULL,
    output TEXT,
    error TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Ideas table: Feature request and idea tracking
CREATE TABLE IF NOT EXISTS ideas (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    priority_level TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    votes INTEGER DEFAULT 0,
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
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE(idea_id, user_id)
);

-- Idea notes table: Comments and notes on ideas
CREATE TABLE IF NOT EXISTS idea_notes (
    id SERIAL PRIMARY KEY,
    idea_id INTEGER NOT NULL,
    user_id INTEGER,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Settings table: System configuration key-value pairs
CREATE TABLE IF NOT EXISTS settings (
    id SERIAL PRIMARY KEY,
    key VARCHAR(255) UNIQUE NOT NULL,
    value TEXT,
    description TEXT,
    category VARCHAR(100),
    is_secret BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Migration log table: Track database migrations (ACTUAL STRUCTURE)
CREATE TABLE IF NOT EXISTS migration_log (
    id SERIAL PRIMARY KEY,
    step_number INTEGER NOT NULL,
    description TEXT NOT NULL,
    sql_executed TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    error_message TEXT,
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Migration mappings table: Track data migrations
CREATE TABLE IF NOT EXISTS migration_mappings (
    table_name VARCHAR(100) NOT NULL,
    old_id TEXT NOT NULL,
    new_id INTEGER NOT NULL,
    old_id_type VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);