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
    console.warn(`Failed to get setting ${key} from database:`, error.message);
    return null;
  }
}

/**
 * Build tools for scheduled execution - matches main app's buildToolsForRequest
 */
async function buildToolsForScheduledExecution(enabledTools, modelId, provider) {
  console.log('Building tools for scheduled execution', {
    enabledTools,
    modelId,
    provider,
    enabledToolsCount: enabledTools.length
  });

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
      console.warn(`No native tools available for provider: ${provider}`);
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
      console.warn('OpenAI API key not configured, skipping native tools');
      return {};
    }

    // Dynamically import the OpenAI SDK to avoid bundling issues
    const { createOpenAI } = await import('@ai-sdk/openai');
    const openai = createOpenAI({ apiKey });

    // Web search tool - matches main app implementation
    if (enabledTools.includes('webSearch')) {
      tools.web_search_preview = openai.tools.webSearchPreview({
        searchContextSize: 'high',
      });
      console.log('Added OpenAI web search preview tool');
    }

    // Code interpreter tool - matches main app implementation
    if (enabledTools.includes('codeInterpreter')) {
      tools.code_interpreter = openai.tools.codeInterpreter({});
      console.log('Added OpenAI code interpreter tool');
    }

  } catch (error) {
    console.error('Failed to create OpenAI native tools', { error: error.message });
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
      console.warn('Google API key not configured, skipping native tools');
      return {};
    }

    // Set environment variable for Google SDK
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = apiKey;

    // Dynamically import the Google SDK
    const { google } = await import('@ai-sdk/google');

    // Web search tool - matches main app implementation
    if (enabledTools.includes('webSearch')) {
      tools.google_search = google.tools.googleSearch({});
      console.log('Added Google search tool');
    }

    // Code execution is built into Gemini models
    if (enabledTools.includes('codeInterpreter')) {
      console.log('Code execution enabled - Gemini models have built-in support');
    }

  } catch (error) {
    console.error('Failed to create Google native tools', { error: error.message });
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
    console.log('Bedrock native tools not implemented yet');
  } catch (error) {
    console.error('Failed to create Bedrock native tools', { error: error.message });
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