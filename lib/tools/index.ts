// Central export for all tool-related functionality

// IMPORTANT: Only export client-safe functions here to avoid bundling server dependencies
// Server-side functions should be imported directly from their modules

// Client-side exports only (these are safe for browser usage)
export {
  getModelCapabilities,
  getAvailableToolsForModel, 
  getAllTools,
  getToolConfig,
  isToolAvailableForModel
} from './client-tool-registry'

// Type exports
export type { ModelCapabilities, ToolConfig } from './client-tool-registry'