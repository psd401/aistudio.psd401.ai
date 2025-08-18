import { executeSQL, FormattedRow } from '@/lib/db/data-api-adapter';
import { createLogger } from '@/lib/logger';
import { contextMonitor } from '@/lib/monitoring/context-loading-monitor';

const log = createLogger({ module: 'execution-context' });

export interface ExecutionContextResult {
  executionContext: string;
  completeData: {
    execution: FormattedRow;
    promptResults: FormattedRow[];
    allChainPrompts: FormattedRow[];
    toolInputFields: FormattedRow[];
    assistantKnowledge: string;
    systemContexts: string[];
    repositoryIds: number[];
  };
}

/**
 * Loads complete execution context for assistant executions
 */
export async function getExecutionContext(
  executionId: number
): Promise<string> {
  log.debug('Loading execution context', { executionId });
  
  // Validate execution ID
  if (!executionId || isNaN(executionId) || executionId <= 0) {
    log.error('Invalid execution ID', { executionId });
    return '';
  }
  
  const loadStartTime = Date.now();
  
  try {
    const result = await loadExecutionContextData(executionId);
    
    if (!result) {
      log.warn('No execution context found', { executionId });
      return '';
    }
    
    // Track successful load
    contextMonitor.trackContextLoad(loadStartTime, {
      executionId,
      systemContexts: result.completeData.systemContexts,
      chainPrompts: result.completeData.allChainPrompts,
      contextLength: result.executionContext.length
    });
    
    log.debug('Execution context loaded successfully', {
      executionId,
      contextLength: result.executionContext.length
    });
    
    return result.executionContext;
    
  } catch (error) {
    log.error('Error loading execution context', { 
      executionId, 
      error 
    });
    
    // Track error
    contextMonitor.trackContextLoad(loadStartTime, {
      executionId,
      error: error instanceof Error ? error : new Error(String(error))
    });
    
    return '';
  }
}

/**
 * Loads and formats complete execution context data
 */
export async function loadExecutionContextData(
  executionId: number
): Promise<ExecutionContextResult | null> {
  // Load all execution data in parallel
  const [executionData, promptResults, allChainPrompts, toolInputFields] = 
    await Promise.all([
      loadExecutionDetails(executionId),
      loadPromptResults(executionId),
      loadChainPrompts(executionId),
      loadToolInputFields(executionId)
    ]);
  
  if (executionData.length === 0) {
    return null;
  }
  
  const execution = executionData[0];
  
  // Build assistant knowledge
  const { 
    assistantKnowledge, 
    systemContexts, 
    repositoryIds 
  } = buildAssistantKnowledge(
    execution,
    allChainPrompts
  );
  
  // Format user inputs
  const formattedInputs = formatUserInputs(
    execution.input_data,
    toolInputFields
  );
  
  // Build complete execution context
  const executionContext = formatExecutionContext({
    execution,
    formattedInputs,
    assistantKnowledge,
    promptResults
  });
  
  return {
    executionContext,
    completeData: {
      execution,
      promptResults,
      allChainPrompts,
      toolInputFields,
      assistantKnowledge,
      systemContexts,
      repositoryIds
    }
  };
}

/**
 * Load execution details
 */
async function loadExecutionDetails(executionId: number) {
  return executeSQL(
    `SELECT te.input_data, te.status as exec_status, 
            te.started_at, te.completed_at,
            aa.name as tool_name, aa.description as tool_description,
            te.assistant_architect_id, aa.user_id as assistant_user_id
    FROM tool_executions te
    LEFT JOIN assistant_architects aa ON te.assistant_architect_id = aa.id
    WHERE te.id = :executionId`,
    [{ name: 'executionId', value: { longValue: executionId } }]
  );
}

/**
 * Load prompt results
 */
async function loadPromptResults(executionId: number) {
  return executeSQL(
    `SELECT pr.prompt_id, pr.input_data, pr.output_data, 
            pr.status, pr.started_at, pr.completed_at,
            cp.name as prompt_name, cp.system_context,
            cp.content as prompt_content
    FROM prompt_results pr
    LEFT JOIN chain_prompts cp ON pr.prompt_id = cp.id
    WHERE pr.execution_id = :executionId
    ORDER BY pr.started_at ASC`,
    [{ name: 'executionId', value: { longValue: executionId } }]
  );
}

/**
 * Load chain prompts
 */
async function loadChainPrompts(executionId: number) {
  return executeSQL(
    `SELECT cp.id, cp.name, cp.content, cp.system_context, 
            cp.position, cp.repository_ids
    FROM chain_prompts cp
    WHERE cp.assistant_architect_id = (
      SELECT assistant_architect_id FROM tool_executions WHERE id = :executionId
    )
    ORDER BY cp.position ASC`,
    [{ name: 'executionId', value: { longValue: executionId } }]
  );
}

/**
 * Load tool input fields
 */
async function loadToolInputFields(executionId: number) {
  return executeSQL(
    `SELECT tif.name, tif.label, tif.field_type
    FROM tool_input_fields tif
    WHERE tif.assistant_architect_id = (
      SELECT assistant_architect_id FROM tool_executions WHERE id = :executionId
    )
    ORDER BY tif.position ASC`,
    [{ name: 'executionId', value: { longValue: executionId } }]
  );
}

/**
 * Build assistant knowledge from prompts and contexts
 */
function buildAssistantKnowledge(
  execution: FormattedRow,
  allChainPrompts: FormattedRow[]
) {
  let assistantKnowledge = '';
  
  // Include assistant description
  if (execution.tool_description) {
    assistantKnowledge += `\n\nAssistant Purpose:\n${execution.tool_description}`;
  }
  
  // Extract repository IDs
  const allRepositoryIds = new Set<number>();
  allChainPrompts.forEach(prompt => {
    if (prompt.repository_ids) {
      const ids = typeof prompt.repository_ids === 'string' 
        ? JSON.parse(prompt.repository_ids) 
        : prompt.repository_ids;
      if (Array.isArray(ids)) {
        ids.forEach(id => allRepositoryIds.add(Number(id)));
      }
    }
  });
  
  // Extract system contexts
  const systemContexts = allChainPrompts
    .map(row => {
      const context = row.system_context || row.systemContext || '';
      return String(context);
    })
    .filter(ctx => ctx.trim() !== '');
  
  if (systemContexts.length > 0) {
    assistantKnowledge += `\n\nAssistant Knowledge Base (System Contexts):\n${systemContexts.join('\n\n---\n\n')}`;
  }
  
  // Include prompt templates
  const promptTemplates = allChainPrompts
    .map(prompt => `${prompt.name}: ${prompt.content}`)
    .join('\n\n');
  
  if (promptTemplates) {
    assistantKnowledge += `\n\nAssistant Prompt Templates:\n${promptTemplates}`;
  }
  
  return {
    assistantKnowledge,
    systemContexts,
    repositoryIds: Array.from(allRepositoryIds)
  };
}

/**
 * Format user inputs with field labels
 */
function formatUserInputs(
  inputData: unknown,
  toolInputFields: FormattedRow[]
): string {
  if (!inputData) return '';
  
  const inputValues = typeof inputData === 'string' 
    ? JSON.parse(inputData) 
    : inputData;
  
  let formatted = '\n\nUser Inputs:\n';
  
  for (const field of toolInputFields) {
    const fieldName = String(field.name);
    const value = inputValues[fieldName];
    if (value !== undefined && value !== null && value !== '') {
      formatted += `- ${field.label}: ${value}\n`;
    }
  }
  
  return formatted;
}

/**
 * Format the complete execution context
 */
function formatExecutionContext(data: {
  execution: FormattedRow;
  formattedInputs: string;
  assistantKnowledge: string;
  promptResults: FormattedRow[];
}): string {
  const { execution, formattedInputs, assistantKnowledge, promptResults } = data;
  
  return `\n\nExecution Context:
Tool: ${execution.tool_name}
Description: ${execution.tool_description}
Execution Status: ${execution.exec_status}
${formattedInputs}
${assistantKnowledge}

Execution Results:
${promptResults.map((pr, idx) => `
${idx + 1}. ${pr.prompt_name || 'Prompt'}:
   Prompt Template: ${pr.prompt_content || 'N/A'}
   Processed Input: ${JSON.stringify(pr.input_data || {})}
   Output: ${pr.output_data || ''}
   Status: ${pr.status || 'unknown'}`).join('\n')}

IMPORTANT: You have access to ALL the information above, including:
- The complete assistant knowledge base with all system contexts
- All prompt templates showing what the assistant knows
- The user's original inputs
- The execution results

Use ALL of this information to answer questions accurately. When asked about specific knowledge (like "10 elements" or any other content), refer to the Assistant Knowledge Base section above.`;
}