/**
 * Type definitions for Prompt Library
 * Based on schema: 039-prompt-library-schema.sql
 */

export type PromptVisibility = 'private' | 'public'
export type ModerationStatus = 'pending' | 'approved' | 'rejected'
export type EventType = 'view' | 'use' | 'share'

export interface Prompt {
  id: string
  userId: number
  title: string
  content: string
  description: string | null
  visibility: PromptVisibility
  moderationStatus: ModerationStatus
  moderatedBy: number | null
  moderatedAt: Date | null
  moderationNotes: string | null
  sourceMessageId: string | null
  sourceConversationId: string | null
  viewCount: number
  useCount: number
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
  // Joined fields
  tags?: string[]
  ownerName?: string
}

export interface PromptTag {
  id: number
  name: string
  createdAt: Date
}

export interface PromptUsageEvent {
  id: number
  promptId: string
  userId: number
  eventType: EventType
  conversationId: string | null
  createdAt: Date
}

export interface PromptListItem extends Omit<Prompt, 'content'> {
  preview: string // First 200 chars of content
}

export interface PromptSearchParams {
  visibility?: PromptVisibility
  tags?: string[]
  search?: string
  userId?: number
  sort?: 'created' | 'usage' | 'views'
  page?: number
  limit?: number
}

export interface PromptListResult {
  prompts: PromptListItem[]
  total: number
  page: number
  limit: number
  hasMore: boolean
}
