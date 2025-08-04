// Type definitions for database operations
// These types match the database structure

export type InsertJob = {
  id?: number;
  userId: number;
  status?: string;
  type: string;
  input: string;
  output?: string | null;
  error?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type SelectJob = {
  id: number;
  userId: number;
  status: string;
  type: string;
  input: string;
  output: string | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type InsertNavigationItem = {
  id?: number;
  label: string;
  icon: string;
  link?: string | null;
  parentId?: number | null;
  description?: string | null;
  type?: string;
  toolId?: number | null;
  requiresRole?: string | null;
  position?: number;
  isActive?: boolean;
  createdAt?: Date;
}

export type SelectNavigationItem = {
  id: number;
  label: string;
  icon: string;
  link: string | null;
  parentId: number | null;
  description: string | null;
  type: string;
  toolId: number | null;
  requiresRole: string | null;
  position: number;
  isActive: boolean;
  createdAt: Date;
}

export type SelectUser = {
  id: number;
  cognitoSub: string | null;
  email: string;
  firstName: string | null;
  lastName: string | null;
  lastSignInAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type SelectDocument = {
  id: number;
  name: string;
  type: string;
  url: string;
  size: number;
  userId: number;
  conversationId: number | null;
  metadata?: any;
  createdAt: Date;
}

export type InsertDocument = {
  id?: number;
  name: string;
  type: string;
  url: string;
  size?: number;
  userId: number;
  conversationId?: number | null;
  metadata?: any;
}

export type SelectDocumentChunk = {
  id: number;
  documentId: number;
  content: string;
  chunkIndex: number;
  metadata?: any;
  createdAt: Date;
}

export type InsertDocumentChunk = {
  id?: number;
  documentId: number;
  content: string;
  chunkIndex: number;
  metadata?: any;
}

export type SelectAssistantArchitect = {
  id: number;
  name: string;
  description: string | null;
  status: string;
  imagePath: string | null;
  userId: number;
  createdAt: Date;
  updatedAt: Date;
}

export type SelectToolInputField = {
  id: number;
  assistantArchitectId: number;
  name: string;
  label: string;
  fieldType: string;
  options: any | null;
  position: number;
  createdAt: Date;
  updatedAt: Date;
}

export type SelectChainPrompt = {
  id: number;
  assistantArchitectId: number;
  name: string;
  content: string;
  systemContext: string | null;
  modelId: number | null;
  position: number;
  inputMapping: any | null;
  parallelGroup: number | null;
  timeoutSeconds: number | null;
  repositoryIds: number[] | null;
  createdAt: Date;
  updatedAt: Date;
}

export type SelectToolExecution = {
  id: number;
  assistantArchitectId: number;
  userId: number;
  inputData: any;
  status: string;
  errorMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
}

export type SelectPromptResult = {
  id: number;
  toolExecutionId: number;
  chainPromptId: number;
  result: string;
  aiModelId: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export type InsertAssistantArchitect = {
  id?: number;
  name: string;
  description?: string;
  status?: string;
  imagePath?: string;
  userId?: number;
}

export type InsertToolInputField = {
  id?: number;
  assistantArchitectId: number;
  name: string;
  label: string;
  fieldType: string;
  options?: any;
  position?: number;
}

export type InsertChainPrompt = {
  id?: number;
  assistantArchitectId: number;
  name: string;
  content: string;
  systemContext?: string;
  modelId?: number;
  position?: number;
  inputMapping?: any;
  parallelGroup?: number;
  timeoutSeconds?: number;
  repositoryIds?: number[];
}

export type InsertToolExecution = {
  id?: number;
  assistantArchitectId: number;
  userId: number;
  inputData: any;
  status?: string;
  errorMessage?: string;
  startedAt?: Date;
  completedAt?: Date;
}

export type InsertPromptResult = {
  id?: number;
  toolExecutionId: number;
  chainPromptId: number;
  result: string;
  aiModelId?: number;
}

export type SelectTool = {
  id: number;
  identifier: string;
  name: string;
  description: string | null;
  promptChainToolId: number | null;
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