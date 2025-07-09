// Re-export types from db-types
export type {
  SelectUser,
  SelectDocument,
  SelectAssistantArchitect,
  SelectToolInputField,
  SelectChainPrompt,
  SelectToolExecution,
  SelectPromptResult,
  SelectJob,
  SelectNavigationItem,
  SelectTool,
  SelectAiModel,
  InsertAssistantArchitect,
  InsertToolInputField,
  InsertChainPrompt,
  InsertToolExecution,
  InsertPromptResult,
  InsertJob,
  InsertNavigationItem,
  InsertDocument,
  InsertDocumentChunk,
  SelectDocumentChunk
} from '@/types/db-types';

export type Role = 'student' | 'staff' | 'administrator'

// Core Types - these need to be added to db-types.ts if used
export type InsertUser = {
  id?: string;
  cognitoSub?: string | null;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  lastSignInAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type InsertIdea = {
  id?: string;
  title: string;
  description: string;
  priorityLevel: string;
  status?: string;
  userId: string;
  completedBy?: string | null;
  completedAt?: Date | null;
  createdAt?: Date;
}

export type SelectIdea = {
  id: string;
  title: string;
  description: string;
  priorityLevel: string;
  status: string;
  userId: string;
  completedBy: string | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type InsertIdeaNote = {
  id?: string;
  ideaId: string;
  userId: string;
  content: string;
  createdAt?: Date;
}

export type SelectIdeaNote = {
  id: string;
  ideaId: string;
  userId: string;
  content: string;
  createdAt: Date;
}

export type InsertIdeaVote = {
  id?: string;
  ideaId: string;
  userId: string;
  createdAt?: Date;
}

export type SelectIdeaVote = {
  id: string;
  ideaId: string;
  userId: string;
  createdAt: Date;
}

export type InsertAiModel = {
  id?: number;
  name: string;
  modelId: string;
  provider?: string | null;
  description?: string | null;
  capabilities?: string | null;
  maxTokens?: number | null;
  active?: boolean;
  chatEnabled?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export type InsertConversation = {
  id?: number;
  userId: string;
  title?: string;
  modelId?: string | null;
  source?: string | null;
  executionId?: string | null;
  context?: any;
  createdAt?: Date;
  updatedAt?: Date;
}

export type SelectConversation = {
  id: number;
  userId: string;
  title: string;
  modelId: string | null;
  source: string | null;
  executionId: string | null;
  context: any;
  createdAt: Date;
  updatedAt: Date;
}

export type InsertMessage = {
  id?: number;
  conversationId: number;
  role: string;
  content: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type SelectMessage = {
  id: number;
  conversationId: number;
  role: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}