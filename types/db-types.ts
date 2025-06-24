// Temporary type definitions to replace Drizzle schema types
// These types match the database structure

export type InsertJob = {
  id?: string;
  userId: string;
  status?: string;
  type: string;
  input: string;
  output?: string | null;
  error?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type SelectJob = {
  id: string;
  userId: string;
  status: string;
  type: string;
  input: string;
  output: string | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type InsertNavigationItem = {
  id?: string;
  label: string;
  icon: string;
  link?: string | null;
  parentId?: string | null;
  description?: string | null;
  type?: string;
  toolId?: string | null;
  requiresRole?: string | null;
  position?: number;
  isActive?: boolean;
  createdAt?: Date;
}

export type SelectNavigationItem = {
  id: string;
  label: string;
  icon: string;
  link: string | null;
  parentId: string | null;
  description: string | null;
  type: string;
  toolId: string | null;
  requiresRole: string | null;
  position: number;
  isActive: boolean;
  createdAt: Date;
}

export type SelectUser = {
  id: string;
  cognitoSub: string | null;
  email: string;
  firstName: string | null;
  lastName: string | null;
  lastSignInAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type SelectDocument = {
  id: string;
  name: string;
  type: string;
  url: string;
  size: number;
  userId: string;
  conversationId: number | null;
  metadata?: any;
  createdAt: Date;
}

export type InsertDocument = {
  id?: string;
  name: string;
  type: string;
  url: string;
  size?: number;
  userId: string;
  conversationId?: number | null;
  metadata?: any;
}

export type SelectDocumentChunk = {
  id: string;
  documentId: string;
  content: string;
  chunkIndex: number;
  metadata?: any;
  createdAt: Date;
}

export type InsertDocumentChunk = {
  id?: string;
  documentId: string;
  content: string;
  chunkIndex: number;
  metadata?: any;
}

export type SelectAssistantArchitect = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  imagePath: string | null;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

export type SelectToolInputField = {
  id: string;
  toolId: string;
  name: string;
  label: string;
  type: string;
  placeholder: string | null;
  required: boolean;
  defaultValue: string | null;
  options: string | null;
  position: number;
  createdAt: Date;
  updatedAt: Date;
}

export type SelectChainPrompt = {
  id: string;
  toolId: string;
  prompt: string;
  position: number;
  aiModelId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type SelectToolExecution = {
  id: string;
  toolId: string;
  userId: string;
  input: any;
  status: string;
  jobId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type SelectPromptResult = {
  id: string;
  toolExecutionId: string;
  chainPromptId: string;
  result: string;
  aiModelId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type InsertAssistantArchitect = {
  id?: string;
  name: string;
  description?: string;
  status?: string;
  imagePath?: string;
  userId?: string;
}

export type InsertToolInputField = {
  id?: string;
  toolId: string;
  name: string;
  label: string;
  type: string;
  placeholder?: string;
  required?: boolean;
  defaultValue?: string;
  options?: string;
  position?: number;
}

export type InsertChainPrompt = {
  id?: string;
  toolId: string;
  prompt: string;
  position?: number;
  aiModelId?: string;
}

export type InsertToolExecution = {
  id?: string;
  toolId: string;
  userId: string;
  input: any;
  status?: string;
  jobId?: string;
}

export type InsertPromptResult = {
  id?: string;
  toolExecutionId: string;
  chainPromptId: string;
  result: string;
  aiModelId?: string;
}

export type SelectTool = {
  id: string;
  identifier: string;
  name: string;
  description: string | null;
  promptChainToolId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type SelectAiModel = {
  id: number;
  name: string;
  modelId: string;
  provider: string | null;
  description: string | null;
  capabilities: string | null;
  maxTokens: number | null;
  active: boolean;
  chatEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}