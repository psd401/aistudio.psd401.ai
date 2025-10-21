-- 038-prompt-library-schema-rollback.sql
-- Rollback for Prompt Library schema

DROP TABLE IF EXISTS prompt_usage_events;

DROP TABLE IF EXISTS prompt_library_tags;

DROP TABLE IF EXISTS prompt_tags;

DROP TABLE IF EXISTS prompt_library;
