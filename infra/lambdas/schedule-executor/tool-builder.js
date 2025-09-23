/**
 * Tool builder for scheduled execution Lambda
 * This creates provider-native tools compatible with the main app's tool system
 */
const { RDSDataClient, ExecuteStatementCommand } = require('@aws-sdk/client-rds-data');

const rdsClient = new RDSDataClient({});
const DATABASE_RESOURCE_ARN = process.env.DATABASE_RESOURCE_ARN;
const DATABASE_SECRET_ARN = process.env.DATABASE_SECRET_ARN;
const DATABASE_NAME = process.env.DATABASE_NAME;

/**
 * Get settings from database settings table
 */
async function getSettingFromDatabase(key) {
  try {
    const command = new ExecuteStatementCommand({
      resourceArn: DATABASE_RESOURCE_ARN,
      secretArn: DATABASE_SECRET_ARN,
      database: DATABASE_NAME,
      sql: `SELECT value FROM settings WHERE key = :key`,
      parameters: [
        { name: 'key', value: { stringValue: key } }
      ]
    });

    const response = await rdsClient.send(command);
    if (response.records && response.records.length > 0) {
      return response.records[0][0].stringValue;
    }
    return null;
  } catch (error) {
    const logEntry = {
      level: 'WARN',
      message: 'Failed to get setting from database',
      key,
      error: error.message,
      timestamp: new Date().toISOString(),
      service: 'schedule-executor-tool-builder'
    };
    process.stderr.write(JSON.stringify(logEntry) + '\n');
    return null;
  }
}

/**
 * Build tools for scheduled execution - matches main app's buildToolsForRequest
 */
async function buildToolsForScheduledExecution(enabledTools, modelId, provider) {
  const logEntry = {
    level: 'INFO',
    message: 'Building tools for scheduled execution',
    modelId,
    provider,
    enabledToolsCount: enabledTools?.length || 0,
    timestamp: new Date().toISOString(),
    service: 'schedule-executor-tool-builder'
  };
  process.stdout.write(JSON.stringify(logEntry) + '\n');

  if (!provider || !enabledTools || enabledTools.length === 0) {
    return {};
  }

  switch (provider.toLowerCase()) {
    case 'openai':
      return await createOpenAINativeTools(enabledTools);
    case 'google':
      return await createGoogleNativeTools(enabledTools);
    case 'amazon-bedrock':
      return await createBedrockNativeTools(enabledTools);
    default:
      const warnEntry = {
        level: 'WARN',
        message: 'No native tools available for provider',
        provider,
        timestamp: new Date().toISOString(),
        service: 'schedule-executor-tool-builder'
      };
      process.stderr.write(JSON.stringify(warnEntry) + '\n');
      return {};
  }
}

/**
 * Create OpenAI native tools for Lambda environment
 */
async function createOpenAINativeTools(enabledTools) {
  const tools = {};

  try {
    // Get OpenAI API key from database settings table
    const apiKey = await getSettingFromDatabase('OPENAI_API_KEY');
    if (!apiKey) {
      const warnEntry = {
        level: 'WARN',
        message: 'OpenAI API key not configured, skipping native tools',
        timestamp: new Date().toISOString(),
        service: 'schedule-executor-tool-builder'
      };
      process.stderr.write(JSON.stringify(warnEntry) + '\n');
      return {};
    }

    // SECURITY FIX: Use static import instead of dynamic import for security
    const { createOpenAI } = require('@ai-sdk/openai');
    const openai = createOpenAI({ apiKey });

    // Web search tool - matches main app implementation
    if (enabledTools.includes('webSearch')) {
      tools.web_search_preview = openai.tools.webSearchPreview({
        searchContextSize: 'high',
      });
      const infoEntry = {
        level: 'INFO',
        message: 'Added OpenAI web search preview tool',
        timestamp: new Date().toISOString(),
        service: 'schedule-executor-tool-builder'
      };
      process.stdout.write(JSON.stringify(infoEntry) + '\n');
    }

    // Code interpreter tool - matches main app implementation
    if (enabledTools.includes('codeInterpreter')) {
      tools.code_interpreter = openai.tools.codeInterpreter({});
      const infoEntry = {
        level: 'INFO',
        message: 'Added OpenAI code interpreter tool',
        timestamp: new Date().toISOString(),
        service: 'schedule-executor-tool-builder'
      };
      process.stdout.write(JSON.stringify(infoEntry) + '\n');
    }

  } catch (error) {
    const errorEntry = {
      level: 'ERROR',
      message: 'Failed to create OpenAI native tools',
      error: error.message,
      timestamp: new Date().toISOString(),
      service: 'schedule-executor-tool-builder'
    };
    process.stderr.write(JSON.stringify(errorEntry) + '\n');
  }

  return tools;
}

/**
 * Create Google native tools for Lambda environment
 */
async function createGoogleNativeTools(enabledTools) {
  const tools = {};

  try {
    // Get Google API key from database settings table
    const apiKey = await getSettingFromDatabase('GOOGLE_API_KEY');
    if (!apiKey) {
      const warnEntry = {
        level: 'WARN',
        message: 'Google API key not configured, skipping native tools',
        timestamp: new Date().toISOString(),
        service: 'schedule-executor-tool-builder'
      };
      process.stderr.write(JSON.stringify(warnEntry) + '\n');
      return {};
    }

    // SECURITY FIX: Use static import and pass credentials directly instead of modifying process.env
    const { google } = require('@ai-sdk/google');
    const googleClient = google({
      apiKey: apiKey // Pass directly, don't modify process.env
    });

    // Web search tool - matches main app implementation
    if (enabledTools.includes('webSearch')) {
      tools.google_search = googleClient.tools.googleSearch({});
      const infoEntry = {
        level: 'INFO',
        message: 'Added Google search tool',
        timestamp: new Date().toISOString(),
        service: 'schedule-executor-tool-builder'
      };
      process.stdout.write(JSON.stringify(infoEntry) + '\n');
    }

    // Code execution is built into Gemini models
    if (enabledTools.includes('codeInterpreter')) {
      const infoEntry = {
        level: 'INFO',
        message: 'Code execution enabled - Gemini models have built-in support',
        timestamp: new Date().toISOString(),
        service: 'schedule-executor-tool-builder'
      };
      process.stdout.write(JSON.stringify(infoEntry) + '\n');
    }

  } catch (error) {
    const errorEntry = {
      level: 'ERROR',
      message: 'Failed to create Google native tools',
      error: error.message,
      timestamp: new Date().toISOString(),
      service: 'schedule-executor-tool-builder'
    };
    process.stderr.write(JSON.stringify(errorEntry) + '\n');
  }

  return tools;
}

/**
 * Create Bedrock native tools for Lambda environment
 */
async function createBedrockNativeTools(enabledTools) {
  const tools = {};

  try {
    // Bedrock tools would be configured here
    // For now, return empty as Bedrock may not have native tool support
    const infoEntry = {
      level: 'INFO',
      message: 'Bedrock native tools not implemented yet',
      timestamp: new Date().toISOString(),
      service: 'schedule-executor-tool-builder'
    };
    process.stdout.write(JSON.stringify(infoEntry) + '\n');
  } catch (error) {
    const errorEntry = {
      level: 'ERROR',
      message: 'Failed to create Bedrock native tools',
      error: error.message,
      timestamp: new Date().toISOString(),
      service: 'schedule-executor-tool-builder'
    };
    process.stderr.write(JSON.stringify(errorEntry) + '\n');
  }

  return tools;
}

/**
 * Collect unique enabled tools from all prompts
 */
function collectEnabledToolsFromPrompts(prompts) {
  const allEnabledTools = new Set();

  for (const prompt of prompts) {
    if (prompt.enabled_tools && Array.isArray(prompt.enabled_tools)) {
      prompt.enabled_tools.forEach(tool => allEnabledTools.add(tool));
    }
  }

  return Array.from(allEnabledTools);
}

module.exports = {
  buildToolsForScheduledExecution,
  collectEnabledToolsFromPrompts
};