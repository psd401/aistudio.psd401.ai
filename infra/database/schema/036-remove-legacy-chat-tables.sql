-- Migration: 036-remove-legacy-chat-tables.sql
-- Description: Remove legacy chat system tables (conversations and messages)
-- Date: 2025-10-18
-- Issue: #344

-- Drop the messages table first (due to foreign key constraint)
DROP TABLE IF EXISTS messages CASCADE;

-- Drop the conversations table
DROP TABLE IF EXISTS conversations CASCADE;

-- Note: The new Nexus chat system uses nexus_conversations and nexus_messages tables
-- This migration removes only the old/legacy chat tables
