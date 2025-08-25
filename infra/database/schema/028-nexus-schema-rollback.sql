-- =====================================================
-- Rollback: 028-nexus-schema-rollback.sql
-- Description: Rollback script for Nexus database schema
-- Author: Kris Hagel
-- Date: 2025-08-23
-- =====================================================

-- CRITICAL: This script removes all Nexus tables and data
-- Only use this if migration 028 needs to be completely rolled back

-- =====================================================
-- DROP TRIGGERS FIRST
-- =====================================================

DROP TRIGGER IF EXISTS update_nexus_conversations_updated_at ON nexus_conversations;
DROP TRIGGER IF EXISTS update_nexus_folders_updated_at ON nexus_folders;
DROP TRIGGER IF EXISTS update_nexus_user_preferences_updated_at ON nexus_user_preferences;
DROP TRIGGER IF EXISTS update_nexus_mcp_servers_updated_at ON nexus_mcp_servers;
DROP TRIGGER IF EXISTS update_nexus_mcp_connections_updated_at ON nexus_mcp_connections;
DROP TRIGGER IF EXISTS update_nexus_templates_updated_at ON nexus_templates;

-- =====================================================
-- DROP TABLES IN REVERSE DEPENDENCY ORDER
-- =====================================================

-- Templates & Sharing Layer
DROP TABLE IF EXISTS nexus_shares CASCADE;
DROP TABLE IF EXISTS nexus_templates CASCADE;

-- MCP Integration Layer  
DROP TABLE IF EXISTS nexus_mcp_audit_logs CASCADE;
DROP TABLE IF EXISTS nexus_mcp_connections CASCADE;
DROP TABLE IF EXISTS nexus_mcp_capabilities CASCADE;
DROP TABLE IF EXISTS nexus_mcp_servers CASCADE;

-- Event & Cache Layer
DROP TABLE IF EXISTS nexus_cache_entries CASCADE;
DROP TABLE IF EXISTS nexus_conversation_events CASCADE;

-- Organization Layer
DROP TABLE IF EXISTS nexus_conversation_folders CASCADE;
DROP TABLE IF EXISTS nexus_user_preferences CASCADE;

-- Core Nexus Layer
DROP TABLE IF EXISTS nexus_conversations CASCADE;
DROP TABLE IF EXISTS nexus_folders CASCADE;

-- =====================================================
-- CLEANUP MIGRATION LOG (OPTIONAL)
-- =====================================================

-- Remove the migration record so it can be run again if needed
-- DELETE FROM migration_log WHERE description = '028-nexus-schema.sql';

-- =====================================================
-- END OF ROLLBACK
-- =====================================================

-- NOTE: The update_updated_at_column() function is left intact
-- as it may be used by other tables in the database