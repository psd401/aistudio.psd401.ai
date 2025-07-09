-- 003-constraints.sql: Add all foreign key constraints
-- This file adds referential integrity constraints between tables

-- User roles constraints
ALTER TABLE user_roles 
    ADD CONSTRAINT user_roles_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE user_roles 
    ADD CONSTRAINT user_roles_role_id_fkey 
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE;

-- Role tools constraints
ALTER TABLE role_tools 
    ADD CONSTRAINT role_tools_role_id_fkey 
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE;

ALTER TABLE role_tools 
    ADD CONSTRAINT role_tools_tool_id_fkey 
    FOREIGN KEY (tool_id) REFERENCES tools(id) ON DELETE CASCADE;

-- Tools constraints
ALTER TABLE tools 
    ADD CONSTRAINT tools_prompt_chain_tool_id_fkey 
    FOREIGN KEY (prompt_chain_tool_id) REFERENCES tools(id) ON DELETE SET NULL;

-- Navigation items constraints
ALTER TABLE navigation_items 
    ADD CONSTRAINT navigation_items_parent_id_fkey 
    FOREIGN KEY (parent_id) REFERENCES navigation_items(id) ON DELETE CASCADE;

ALTER TABLE navigation_items 
    ADD CONSTRAINT navigation_items_tool_id_fkey 
    FOREIGN KEY (tool_id) REFERENCES tools(id) ON DELETE SET NULL;

-- Assistant architects constraints
ALTER TABLE assistant_architects 
    ADD CONSTRAINT assistant_architects_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- Chain prompts constraints
ALTER TABLE chain_prompts 
    ADD CONSTRAINT chain_prompts_assistant_architect_id_fkey 
    FOREIGN KEY (assistant_architect_id) REFERENCES assistant_architects(id) ON DELETE CASCADE;

ALTER TABLE chain_prompts 
    ADD CONSTRAINT chain_prompts_model_id_fkey 
    FOREIGN KEY (model_id) REFERENCES ai_models(id) ON DELETE SET NULL;

-- Tool input fields constraints
ALTER TABLE tool_input_fields 
    ADD CONSTRAINT tool_input_fields_assistant_architect_id_fkey 
    FOREIGN KEY (assistant_architect_id) REFERENCES assistant_architects(id) ON DELETE CASCADE;

-- Tool executions constraints
ALTER TABLE tool_executions 
    ADD CONSTRAINT tool_executions_assistant_architect_id_fkey 
    FOREIGN KEY (assistant_architect_id) REFERENCES assistant_architects(id) ON DELETE CASCADE;

ALTER TABLE tool_executions 
    ADD CONSTRAINT tool_executions_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- Prompt results constraints
ALTER TABLE prompt_results 
    ADD CONSTRAINT prompt_results_execution_id_fkey 
    FOREIGN KEY (execution_id) REFERENCES tool_executions(id) ON DELETE CASCADE;

ALTER TABLE prompt_results 
    ADD CONSTRAINT prompt_results_prompt_id_fkey 
    FOREIGN KEY (prompt_id) REFERENCES chain_prompts(id) ON DELETE CASCADE;

-- Tool edits constraints
ALTER TABLE tool_edits 
    ADD CONSTRAINT tool_edits_assistant_architect_id_fkey 
    FOREIGN KEY (assistant_architect_id) REFERENCES assistant_architects(id) ON DELETE CASCADE;

ALTER TABLE tool_edits 
    ADD CONSTRAINT tool_edits_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- Conversations constraints
ALTER TABLE conversations 
    ADD CONSTRAINT conversations_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE conversations 
    ADD CONSTRAINT conversations_model_id_fkey 
    FOREIGN KEY (model_id) REFERENCES ai_models(id) ON DELETE SET NULL;

ALTER TABLE conversations 
    ADD CONSTRAINT conversations_execution_id_fkey 
    FOREIGN KEY (execution_id) REFERENCES tool_executions(id) ON DELETE SET NULL;

-- Messages constraints
ALTER TABLE messages 
    ADD CONSTRAINT messages_conversation_id_fkey 
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

-- Documents constraints
ALTER TABLE documents 
    ADD CONSTRAINT documents_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE documents 
    ADD CONSTRAINT documents_conversation_id_fkey 
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL;

-- Document chunks constraints
ALTER TABLE document_chunks 
    ADD CONSTRAINT document_chunks_document_id_fkey 
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE;

-- Jobs constraints
ALTER TABLE jobs 
    ADD CONSTRAINT jobs_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- Ideas constraints
ALTER TABLE ideas 
    ADD CONSTRAINT ideas_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- Idea votes constraints
ALTER TABLE idea_votes 
    ADD CONSTRAINT idea_votes_idea_id_fkey 
    FOREIGN KEY (idea_id) REFERENCES ideas(id) ON DELETE CASCADE;

ALTER TABLE idea_votes 
    ADD CONSTRAINT idea_votes_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- Idea notes constraints
ALTER TABLE idea_notes 
    ADD CONSTRAINT idea_notes_idea_id_fkey 
    FOREIGN KEY (idea_id) REFERENCES ideas(id) ON DELETE CASCADE;

ALTER TABLE idea_notes 
    ADD CONSTRAINT idea_notes_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;