-- 036-add-schedule-navigation.sql
-- Migration to add schedule management navigation item
-- Part of Issue #269: Frontend: Schedule Management Dashboard

-- Insert navigation item for Schedule Management
-- This allows users with assistant-architect tool access to navigate to the schedule management page
INSERT INTO navigation_items (label, link, icon, position, type, tool_id, is_active, description)
SELECT
    'Schedules',
    '/schedules',
    'Calendar',
    15,
    'link',
    t.id,
    true,
    'Manage automated Assistant Architect execution schedules'
FROM tools t
WHERE t.identifier = 'architect'
ON CONFLICT (label, link) DO UPDATE SET
    icon = EXCLUDED.icon,
    position = EXCLUDED.position,
    type = EXCLUDED.type,
    tool_id = EXCLUDED.tool_id,
    is_active = EXCLUDED.is_active,
    description = EXCLUDED.description;