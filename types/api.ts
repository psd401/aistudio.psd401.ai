/**
 * Generic API response type
 */
export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Type for request with typed params
 */
export interface TypedRequest<TParams = Record<string, string>> extends Request {
  params: TParams;
}

/**
 * Common route params types
 */
export interface RouteParams {
  id: string;
}

export interface RoleRouteParams {
  roleId: string;
}

export interface RoleToolRouteParams {
  roleId: string;
  toolId: string;
}

export interface ConversationRouteParams {
  conversationId: string;
}

export interface IdeaRouteParams {
  id: string;
}

/**
 * Type for parsed JSON body
 */
export type JsonBody<T = unknown> = T;