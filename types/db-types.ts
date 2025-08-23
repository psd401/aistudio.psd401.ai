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
  allowedRoles?: string | null;
}

// =====================================================
// NEXUS DATABASE TYPES
// =====================================================

// Nexus Conversations
export type SelectNexusConversation = {
  id: string;
  userId: number;
  provider: 'openai' | 'anthropic' | 'google' | 'azure' | 'local';
  externalId: string | null;
  cacheKey: string | null;
  title: string | null;
  modelUsed: string | null;
  folderId: string | null;
  messageCount: number;
  totalTokens: number;
  lastMessageAt: Date;
  isArchived: boolean;
  isPinned: boolean;
  metadata: any;
  createdAt: Date;
  updatedAt: Date;
}

export type InsertNexusConversation = {
  id?: string;
  userId: number;
  provider: 'openai' | 'anthropic' | 'google' | 'azure' | 'local';
  externalId?: string;
  cacheKey?: string;
  title?: string;
  modelUsed?: string;
  folderId?: string;
  messageCount?: number;
  totalTokens?: number;
  lastMessageAt?: Date;
  isArchived?: boolean;
  isPinned?: boolean;
  metadata?: any;
}

// Nexus Folders
export type SelectNexusFolder = {
  id: string;
  userId: number;
  parentId: string | null;
  name: string;
  color: string;
  icon: string;
  sortOrder: number;
  isExpanded: boolean;
  settings: any;
  createdAt: Date;
  updatedAt: Date;
}

export type InsertNexusFolder = {
  id?: string;
  userId: number;
  parentId?: string;
  name: string;
  color?: string;
  icon?: string;
  sortOrder?: number;
  isExpanded?: boolean;
  settings?: any;
}

// Nexus User Preferences
export type SelectNexusUserPreferences = {
  userId: number;
  expandedFolders: any;
  panelWidth: number;
  sortPreference: string;
  viewMode: string;
  settings: any;
  createdAt: Date;
  updatedAt: Date;
}

export type InsertNexusUserPreferences = {
  userId: number;
  expandedFolders?: any;
  panelWidth?: number;
  sortPreference?: string;
  viewMode?: string;
  settings?: any;
}

// Nexus Conversation Events
export type SelectNexusConversationEvent = {
  id: string;
  conversationId: string;
  eventType: string;
  eventData: any;
  createdAt: Date;
}

export type InsertNexusConversationEvent = {
  id?: string;
  conversationId: string;
  eventType: string;
  eventData: any;
}

// Nexus Cache Entries
export type SelectNexusCacheEntry = {
  cacheKey: string;
  provider: string;
  conversationId: string | null;
  ttl: number;
  expiresAt: Date;
  hitCount: number;
  byteSize: number | null;
  createdAt: Date;
}

export type InsertNexusCacheEntry = {
  cacheKey: string;
  provider: string;
  conversationId?: string;
  ttl: number;
  expiresAt: Date;
  hitCount?: number;
  byteSize?: number;
}

// Nexus MCP Servers
export type SelectNexusMcpServer = {
  id: string;
  name: string;
  url: string;
  transport: 'stdio' | 'http' | 'websocket';
  authType: 'api_key' | 'oauth' | 'jwt' | 'none';
  credentialsKey: string | null;
  allowedUsers: number[] | null;
  maxConnections: number;
  createdAt: Date;
  updatedAt: Date;
}

export type InsertNexusMcpServer = {
  id?: string;
  name: string;
  url: string;
  transport: 'stdio' | 'http' | 'websocket';
  authType: 'api_key' | 'oauth' | 'jwt' | 'none';
  credentialsKey?: string;
  allowedUsers?: number[];
  maxConnections?: number;
}

// Nexus MCP Capabilities
export type SelectNexusMcpCapability = {
  id: string;
  serverId: string;
  type: 'tool' | 'resource' | 'prompt';
  name: string;
  description: string | null;
  inputSchema: any;
  outputSchema: any | null;
  sandboxLevel: 'standard' | 'strict' | 'none';
  rateLimit: number;
}

export type InsertNexusMcpCapability = {
  id?: string;
  serverId: string;
  type: 'tool' | 'resource' | 'prompt';
  name: string;
  description?: string;
  inputSchema: any;
  outputSchema?: any;
  sandboxLevel?: 'standard' | 'strict' | 'none';
  rateLimit?: number;
}

// Nexus MCP Connections
export type SelectNexusMcpConnection = {
  id: string;
  serverId: string;
  userId: number;
  status: 'connected' | 'disconnected' | 'error' | 'connecting';
  lastHealthCheck: Date | null;
  latencyMs: number | null;
  errorCount: number;
  successCount: number;
  circuitState: 'open' | 'closed' | 'half_open';
  lastError: string | null;
  lastConnectedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type InsertNexusMcpConnection = {
  id?: string;
  serverId: string;
  userId: number;
  status: 'connected' | 'disconnected' | 'error' | 'connecting';
  lastHealthCheck?: Date;
  latencyMs?: number;
  errorCount?: number;
  successCount?: number;
  circuitState?: 'open' | 'closed' | 'half_open';
  lastError?: string;
  lastConnectedAt?: Date;
}

// Nexus MCP Audit Logs
export type SelectNexusMcpAuditLog = {
  id: string;
  userId: number;
  serverId: string;
  toolName: string;
  input: any | null;
  output: any | null;
  error: string | null;
  durationMs: number | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

export type InsertNexusMcpAuditLog = {
  id?: string;
  userId: number;
  serverId: string;
  toolName: string;
  input?: any;
  output?: any;
  error?: string;
  durationMs?: number;
  ipAddress?: string;
  userAgent?: string;
}

// Nexus Templates
export type SelectNexusTemplate = {
  id: string;
  userId: number | null;
  name: string;
  description: string | null;
  prompt: string;
  variables: any;
  isPublic: boolean;
  usageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export type InsertNexusTemplate = {
  id?: string;
  userId?: number;
  name: string;
  description?: string;
  prompt: string;
  variables?: any;
  isPublic?: boolean;
  usageCount?: number;
}

// Nexus Shares
export type SelectNexusShare = {
  id: string;
  conversationId: string;
  sharedBy: number;
  shareToken: string;
  expiresAt: Date | null;
  viewCount: number;
  createdAt: Date;
}

export type InsertNexusShare = {
  id?: string;
  conversationId: string;
  sharedBy: number;
  shareToken: string;
  expiresAt?: Date;
  viewCount?: number;
}

// Nexus Conversation Folders (Junction Table)
export type SelectNexusConversationFolder = {
  conversationId: string;
  folderId: string;
  position: number;
  pinned: boolean;
  archivedAt: Date | null;
}

export type InsertNexusConversationFolder = {
  conversationId: string;
  folderId: string;
  position?: number;
  pinned?: boolean;
  archivedAt?: Date;
}