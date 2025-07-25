import { streamText } from 'ai';
import { createAzure } from '@ai-sdk/azure';
import { google } from '@ai-sdk/google';
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { createOpenAI } from '@ai-sdk/openai';
import { getServerSession } from "@/lib/auth/server-session";
import { getCurrentUserAction } from "@/actions/db/get-current-user-action";
import { executeSQL, FormattedRow } from "@/lib/db/data-api-adapter";
import { SelectDocument } from "@/types/db-types";
import { Settings } from "@/lib/settings-manager";
import logger from "@/lib/logger";
import { ensureRDSString, ensureRDSNumber } from "@/lib/type-helpers";
import { getDocumentsByConversationId, getDocumentChunksByDocumentId, getDocumentById } from "@/lib/db/queries/documents";
import { contextMonitor } from "@/lib/monitoring/context-loading-monitor";

// Helper function to load complete execution context
async function loadExecutionContext(execId: number) {
  // CRITICAL SAFEGUARD: Validate execution ID
  if (!execId || isNaN(execId) || execId <= 0) {
    logger.error('[stream-final] Invalid execution ID provided to loadExecutionContext:', { execId });
    return null;
  }
  
  const loadStartTime = Date.now();
  
  try {
    // Start loading context
    
    // Get execution details, prompt results, and ALL assistant context in parallel
    const [executionData, promptResults, allChainPrompts, toolInputFields] = await Promise.all([
      executeSQL(
        `SELECT te.input_data, te.status as exec_status, te.started_at, te.completed_at,
                aa.name as tool_name, aa.description as tool_description,
                te.assistant_architect_id
        FROM tool_executions te
        LEFT JOIN assistant_architects aa ON te.assistant_architect_id = aa.id
        WHERE te.id = :executionId`,
        [{ name: 'executionId', value: { longValue: execId } }]
      ),
      executeSQL(
        `SELECT pr.prompt_id, pr.input_data, pr.output_data, 
                pr.status, pr.started_at, pr.completed_at,
                cp.name as prompt_name, cp.system_context,
                cp.content as prompt_content
        FROM prompt_results pr
        LEFT JOIN chain_prompts cp ON pr.prompt_id = cp.id
        WHERE pr.execution_id = :executionId
        ORDER BY pr.started_at ASC`,
        [{ name: 'executionId', value: { longValue: execId } }]
      ),
      executeSQL(
        `SELECT cp.id, cp.name, cp.content, cp.system_context, cp.position
        FROM chain_prompts cp
        WHERE cp.assistant_architect_id = (
          SELECT assistant_architect_id FROM tool_executions WHERE id = :executionId
        )
        ORDER BY cp.position ASC`,
        [{ name: 'executionId', value: { longValue: execId } }]
      ),
      executeSQL(
        `SELECT tif.name, tif.label, tif.field_type
        FROM tool_input_fields tif
        WHERE tif.assistant_architect_id = (
          SELECT assistant_architect_id FROM tool_executions WHERE id = :executionId
        )
        ORDER BY tif.position ASC`,
        [{ name: 'executionId', value: { longValue: execId } }]
      )
    ]);
    
    if (executionData.length === 0) {
      return null;
    }
    
    const execution = executionData[0];
    
    // Build comprehensive execution context
    let assistantKnowledge = '';
    
    // 1. Include assistant description
    if (execution.tool_description) {
      assistantKnowledge += `\n\nAssistant Purpose:\n${execution.tool_description}`;
    }
    
    // 2. Include ALL system contexts from chain prompts
    // Process chain prompts
    
    // SAFEGUARD: Robust system context extraction with validation
    const systemContexts = allChainPrompts
      .map((row, index) => {
        // RDS Data API returns snake_case column names
        const context = row.system_context || row.systemContext || '';
        
        // SAFEGUARD: Log if we find empty contexts
        if (!context || String(context).trim() === '') {
          logger.warn(`[stream-final] Empty system_context found for chain prompt at index ${index}`);
        }
        
        return String(context);
      })
      .filter(ctx => ctx.trim() !== '');
    
    // SAFEGUARD: Alert if no system contexts found when we expect them
    if (systemContexts.length === 0 && allChainPrompts.length > 0) {
      logger.error('[stream-final] WARNING: No system contexts found despite having chain prompts!', {
        chainPromptsCount: allChainPrompts.length,
        firstPromptKeys: allChainPrompts[0] ? Object.keys(allChainPrompts[0]) : []
      });
    }
    
    if (systemContexts.length > 0) {
      assistantKnowledge += `\n\nAssistant Knowledge Base (System Contexts):\n${systemContexts.join('\n\n---\n\n')}`;
    }
    
    // 3. Include all prompt templates
    const promptTemplates = allChainPrompts
      .map(prompt => `${prompt.name}: ${prompt.content}`)
      .join('\n\n');
    
    if (promptTemplates) {
      assistantKnowledge += `\n\nAssistant Prompt Templates:\n${promptTemplates}`;
    }
    
    // 4. Format user inputs with field labels
    let formattedInputs = '';
    if (execution.input_data) {
      const inputValues = typeof execution.input_data === 'string' 
        ? JSON.parse(execution.input_data) 
        : execution.input_data;
      
      formattedInputs = '\n\nUser Inputs:\n';
      for (const field of toolInputFields) {
        const fieldName = String(field.name);
        const value = inputValues[fieldName];
        if (value !== undefined && value !== null && value !== '') {
          formattedInputs += `- ${field.label}: ${value}\n`;
        }
      }
    }
    
    const executionContext = `\n\nExecution Context:
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
    
    // SAFEGUARD: Comprehensive validation before returning
    const contextValidation = {
      executionId: execId,
      hasAssistantKnowledge: assistantKnowledge.length > 0,
      promptResultsCount: promptResults.length,
      allChainPromptsCount: allChainPrompts.length,
      systemContextsCount: systemContexts.length,
      toolInputFieldsCount: toolInputFields.length,
      contextLength: executionContext.length,
      // CRITICAL: Validate we have meaningful content
      hasMinimumContent: executionContext.length > 500,
      hasSystemContexts: systemContexts.length > 0,
      hasPromptTemplates: promptTemplates.length > 0
    };
    
    // Context loaded successfully
    
    // SAFEGUARD: Warn if context seems incomplete
    if (!contextValidation.hasMinimumContent || !contextValidation.hasSystemContexts) {
      logger.warn('[stream-final] Context may be incomplete!', contextValidation);
    }
    
    // SAFEGUARD: Track metrics for monitoring
    contextMonitor.trackContextLoad(loadStartTime, {
      executionId: execId,
      systemContexts,
      chainPrompts: allChainPrompts,
      contextLength: executionContext.length
    });
    
    // Return both the formatted context and the complete data
    return {
      executionContext,
      completeData: {
        execution,
        promptResults,
        allChainPrompts,
        toolInputFields,
        assistantKnowledge,
        systemContexts
      }
    };
  } catch (error) {
    // SAFEGUARD: Detailed error logging
    logger.error('[stream-final] Error loading execution context:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      executionId: execId
    });
    
    // SAFEGUARD: Track error in monitoring
    contextMonitor.trackContextLoad(loadStartTime, {
      executionId: execId,
      error: error instanceof Error ? error : new Error(String(error))
    });
    
    return null;
  }
}
export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) {
      return new Response('Unauthorized', { status: 401 });
    }

    const { messages, modelId: textModelId, conversationId: existingConversationId, documentId, source, executionId, context } = await req.json();
    
    // Process chat request

  // Get model info - handle both numeric ID and string model_id
  const isNumericId = typeof textModelId === 'number' || /^\d+$/.test(String(textModelId));
  
  let modelResult;
  if (isNumericId) {
    // Try to get model by numeric ID
    const modelQuery = `
      SELECT id, name, provider, model_id
      FROM ai_models
      WHERE id = :modelId AND active = true AND chat_enabled = true
      LIMIT 1
    `;
    modelResult = await executeSQL<FormattedRow>(modelQuery, [
      { name: 'modelId', value: { longValue: Number(textModelId) } }
    ]);
  } else {
    // Get model by string model_id
    const modelQuery = `
      SELECT id, name, provider, model_id
      FROM ai_models
      WHERE model_id = :modelId AND active = true AND chat_enabled = true
      LIMIT 1
    `;
    modelResult = await executeSQL<FormattedRow>(modelQuery, [
      { name: 'modelId', value: { stringValue: String(textModelId) } }
    ]);
  }
  
  // If model not found, fall back to first available chat-enabled model
  if (!modelResult.length) {
    const fallbackQuery = `
      SELECT id, name, provider, model_id
      FROM ai_models
      WHERE active = true AND chat_enabled = true
      ORDER BY id
      LIMIT 1
    `;
    modelResult = await executeSQL<FormattedRow>(fallbackQuery);
    
    if (!modelResult.length) {
      return new Response("No chat-enabled models available", { status: 503 });
    }
  }
  
  const aiModel = modelResult[0];
  
  // Model resolved
  
  // Retrieve execution context BEFORE creating conversation so we can store it
  let executionContext = "";
  let fullContext = context;
  let execIdToUse = null;
  let completeExecutionData = null;
  
  // For new conversations with executionId, load context first
  if (!existingConversationId && executionId) {
    // SAFEGUARD: Strict validation of executionId
    
    // Parse executionId to ensure it's a number
    execIdToUse = typeof executionId === 'string' ? parseInt(executionId, 10) : executionId;
    
    // SAFEGUARD: Reject 'streaming' or other invalid values immediately
    if (executionId === 'streaming' || executionId === 'undefined' || executionId === 'null') {
      logger.error('[stream-final] Invalid executionId received:', { executionId, type: typeof executionId });
      execIdToUse = null;
    }
    
    // Load context for new conversation
    
    if (!isNaN(execIdToUse) && execIdToUse > 0) {
      // Load the complete execution context
      const execResult = await loadExecutionContext(execIdToUse);
      if (execResult) {
        executionContext = execResult.executionContext;
        completeExecutionData = execResult.completeData;
        // Store the complete execution data for the conversation context
        fullContext = completeExecutionData;
        // Context loaded successfully
      } else {
        // SAFEGUARD: Critical error if context loading fails
        logger.error('[stream-final] CRITICAL: Failed to load execution context for valid executionId!', {
          executionId: execIdToUse
        });
      }
    }
  }
  
  // Handle conversation
  let conversationId = existingConversationId;
  
  if (!conversationId) {
    const currentUser = await getCurrentUserAction();
    if (!currentUser.isSuccess) {
      return new Response("Unauthorized", { status: 401 });
    }

    const insertQuery = `
      INSERT INTO conversations (title, user_id, model_id, source, execution_id, context)
      VALUES (:title, :userId, :modelId, :source, :executionId, :context::jsonb)
      RETURNING id
    `;
    const newConversation = await executeSQL(insertQuery, [
      { name: 'title', value: { stringValue: messages[0].content.substring(0, 100) } },
      { name: 'userId', value: { longValue: currentUser.data.user.id } },
      { name: 'modelId', value: { longValue: ensureRDSNumber(aiModel.id) } },
      { name: 'source', value: { stringValue: source || "chat" } },
      { name: 'executionId', value: (() => {
        if (!executionId) return { isNull: true };
        const parsed = typeof executionId === 'string' ? parseInt(executionId, 10) : executionId;
        return isNaN(parsed) ? { isNull: true } : { longValue: parsed };
      })() },
      { name: 'context', value: fullContext ? { stringValue: JSON.stringify(fullContext) } : { isNull: true } }
    ]);
    conversationId = newConversation[0].id;
  }

  // Save user message
  const userMessage = messages[messages.length - 1];
  await executeSQL(
    `INSERT INTO messages (conversation_id, role, content) VALUES (:conversationId, :role, :content)`,
    [
      { name: 'conversationId', value: { longValue: conversationId } },
      { name: 'role', value: { stringValue: userMessage.role } },
      { name: 'content', value: { stringValue: userMessage.content } }
    ]
  );

  // Get the model
  let model;
  
  try {
    switch (aiModel.provider) {
      case 'openai': {
        const key = await Settings.getOpenAI();
        if (!key) throw new Error('OpenAI key not configured');
        const openai = createOpenAI({ apiKey: key });
        model = openai(ensureRDSString(aiModel.modelId));
        break;
      }
    case 'azure': {
      const config = await Settings.getAzureOpenAI();
      if (!config.key || !config.resourceName) throw new Error('Azure not configured');
      const azure = createAzure({ apiKey: config.key, resourceName: config.resourceName });
      model = azure(ensureRDSString(aiModel.modelId));
      break;
    }
    case 'google': {
      const key = await Settings.getGoogleAI();
      if (!key) throw new Error('Google key not configured');
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = key;
      model = google(ensureRDSString(aiModel.modelId) as any);
      break;
    }
    case 'amazon-bedrock': {
      const config = await Settings.getBedrock();
      if (!config.accessKeyId) throw new Error('Bedrock not configured');
      const bedrock = createAmazonBedrock({
        region: config.region || undefined,
        accessKeyId: config.accessKeyId || undefined,
        secretAccessKey: config.secretAccessKey || undefined
      });
      model = bedrock(ensureRDSString(aiModel.modelId) as any);
      break;
    }
    default:
      throw new Error(`Unknown provider: ${ensureRDSString(aiModel.provider)}`);
    }
  } catch (modelError) {
    logger.error('[stream-final] Model initialization error:', modelError);
    throw new Error(`Failed to initialize model: ${modelError instanceof Error ? modelError.message : 'Unknown error'}`);
  }

  // Get all messages for context
  const allMessages = await executeSQL<FormattedRow>(
    `SELECT role, content FROM messages WHERE conversation_id = :conversationId ORDER BY created_at ASC`,
    [{ name: 'conversationId', value: { longValue: conversationId } }]
  );

  // --- Fetch documents and relevant content for AI context ---
  let documentContext = "";
  try {
    let documents: SelectDocument[] = [];
    
    // If we have a conversationId, get documents linked to it
    if (conversationId) {
      documents = await getDocumentsByConversationId({ conversationId: conversationId });
    }
    
    // If a documentId was provided, also fetch that specific document
    if (documentId) {
      const singleDoc = await getDocumentById({ id: documentId });
      if (singleDoc && !documents.find((d: SelectDocument) => d.id === documentId)) {
        documents.push(singleDoc);
        // Added document to context
      }
    }
    
    // Process documents for context
    
    if (documents.length > 0) {
      // Found documents for conversation
      // Get the user's latest message for context search
      const latestUserMessage = messages[messages.length - 1].content;
      
      // Get document chunks for all documents
      const documentChunksPromises = documents.map(doc => 
        getDocumentChunksByDocumentId({ documentId: doc.id })
      );
      const documentChunksArrays = await Promise.all(documentChunksPromises);
      let allDocumentChunks = documentChunksArrays.flat();
      
      // If no chunks found and we just uploaded a document, wait a bit and retry
      if (allDocumentChunks.length === 0 && documentId) {
        // Wait for chunks to be saved
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const retryChunksPromises = documents.map(doc => 
          getDocumentChunksByDocumentId({ documentId: doc.id })
        );
        const retryChunksArrays = await Promise.all(retryChunksPromises);
        allDocumentChunks = retryChunksArrays.flat();
      }
      
      // Process document chunks

      // Simple keyword matching to find relevant chunks
      const generalDocumentQueries = ['this', 'document', 'file', 'pdf', 'uploaded', 'attachment'];
      const isGeneralDocumentQuery = generalDocumentQueries.some(term => 
        latestUserMessage.toLowerCase().includes(term)
      );
      
      let relevantChunks = [];
      
      if (isGeneralDocumentQuery || latestUserMessage.toLowerCase().includes('summar')) {
        relevantChunks = allDocumentChunks.slice(0, 5); // Limit to first 5 chunks
      } else {
        relevantChunks = allDocumentChunks
          .filter(chunk => {
            const content = chunk.content.toLowerCase();
            const message = latestUserMessage.toLowerCase();
            const keywords = message.split(/\s+/).filter((word: string) => word.length > 2);
            return keywords.some((keyword: string) => content.includes(keyword));
          })
          .slice(0, 3); // Top 3 most relevant chunks
      }

      // If no chunks matched but we have documents, include at least the first chunk
      if (relevantChunks.length === 0 && allDocumentChunks.length > 0) {
        relevantChunks = allDocumentChunks.slice(0, 3);
      }

      if (relevantChunks.length > 0) {
        const documentNames = documents.map(doc => doc.name).join(", ");
        documentContext = `\n\nRelevant content from uploaded documents (${documentNames}):\n\n${
          relevantChunks.map((chunk, index) => 
            `[Document Excerpt ${index + 1}]:\n${chunk.content}`
          ).join('\n\n')
        }\n\nPlease use this document content to answer the user's questions when relevant.`;
        // Include relevant chunks in context
      } else if (allDocumentChunks.length === 0 && documents.length > 0) {
        documentContext = `\n\nNote: A document was uploaded but its content could not be extracted or is still being processed. The document name is: ${documents.map(d => d.name).join(", ")}`;
        logger.warn(`Document exists but no chunks found for documents: ${documents.map(d => d.id).join(", ")}`);
      } else {
        // No relevant chunks found
      }
    }
  } catch (docError) {
    logger.error("Error fetching document context", { 
      error: docError instanceof Error ? docError.message : String(docError),
      conversationId: conversationId,
      documentId
    });
    // Continue without document context if there's an error
  }

  // Handle existing conversations - retrieve stored context
  if (existingConversationId && !executionContext) {
    const parsedConvId = typeof existingConversationId === 'string' ? parseInt(existingConversationId, 10) : existingConversationId;
    if (!isNaN(parsedConvId) && parsedConvId > 0) {
      const conversationData = await executeSQL(
        `SELECT c.context, c.execution_id
        FROM conversations c
        WHERE c.id = :conversationId`,
        [{ name: 'conversationId', value: { longValue: parsedConvId } }]
      );
      
      if (conversationData.length > 0) {
        const conversation = conversationData[0];
        
        // Try to use stored context first
        try {
          const contextStr = conversation.context as string | null;
          if (contextStr) {
            fullContext = JSON.parse(contextStr);
            
            // If we have stored context with execution data, use it
            if (fullContext && fullContext.execution) {
              // Using stored context from conversation
              
              // Build execution context from stored data
              const stored = fullContext;
              executionContext = `\n\nExecution Context:
Tool: ${stored.execution.tool_name}
Description: ${stored.execution.tool_description}
${stored.formattedInputs || ''}
${stored.assistantKnowledge || ''}

Execution Results:
${stored.promptResults ? stored.promptResults.map((pr: any, idx: number) => `
${idx + 1}. ${pr.prompt_name}:
   Output: ${pr.output_data}
   Status: ${pr.prompt_status}`).join('\n') : 'No results available'}

IMPORTANT: You have access to ALL the information above. Use it to answer questions accurately.`;
            }
          }
        } catch (parseError) {
          logger.warn('Failed to parse conversation context', { 
            conversationId: parsedConvId,
            error: parseError instanceof Error ? parseError.message : 'Unknown error' 
          });
        }
        
        // If no stored context but we have execution_id, load it
        if (!executionContext && conversation.execution_id) {
          execIdToUse = conversation.execution_id;
        }
      }
    }
  }
  
  // Load execution context if needed
  if (!executionContext && execIdToUse) {
    // Validate executionId
    const execId = typeof execIdToUse === 'number' ? execIdToUse : parseInt(String(execIdToUse), 10);
    if (!isNaN(execId) && execId > 0) {
      const result = await loadExecutionContext(execId);
      if (result) {
        executionContext = result.executionContext;
        // Store the complete data for future use
        if (!fullContext) {
          fullContext = result.completeData;
        }
      }
    }
  }

  // Build system prompt based on source
  let systemPrompt = source === "assistant_execution"
    ? `You are a helpful AI assistant having a follow-up conversation about the results of an AI tool execution. 

Key responsibilities:
1. Use the execution context provided to answer questions accurately about the tool execution
2. Reference specific prompt results when relevant to the user's questions
3. If asked about inputs, outputs, or the process, refer to the detailed execution history
4. When asked about the knowledge, context, or information the assistant was given, refer to the "Assistant Knowledge Base" section
5. Stay focused on topics related to the execution results and the assistant's capabilities
6. If a question is completely unrelated to the execution, politely suggest starting a new chat

Remember: You have access to:
- The complete execution history including all inputs, outputs, and prompt results
- The assistant's knowledge base and system context that was used during execution
- The assistant's instructions and configuration
Use all this information to provide accurate and helpful responses about both what happened and why.`
    : "You are a helpful AI assistant.";
  
  systemPrompt += documentContext;
  systemPrompt += executionContext;

  const aiMessages = [
    { role: 'system' as const, content: systemPrompt },
    // Include context for new conversations or if we have full context from retrieval
    ...(fullContext && allMessages.length === 1 ? [{ role: 'system' as const, content: `Initial execution context: ${JSON.stringify(fullContext)}` }] : []),
    ...allMessages.map(msg => ({ 
      role: msg.role === 'user' ? 'user' as const : 'assistant' as const, 
      content: String(msg.content) 
    }))
  ];

  // Start streaming

  // Stream the response
  const result = await streamText({
    model,
    messages: aiMessages,
    onFinish: async ({ text }) => {
      // Stream finished
      // Save assistant message
      try {
        await executeSQL<FormattedRow>(
          `INSERT INTO messages (conversation_id, role, content) VALUES (:conversationId, :role, :content)`,
          [
            { name: 'conversationId', value: { longValue: conversationId } },
            { name: 'role', value: { stringValue: 'assistant' } },
            { name: 'content', value: { stringValue: text } }
          ]
        );
        // Assistant response saved
      } catch (error) {
        logger.error('[stream-final] Error saving response:', error);
      }
    }
  });

  // Return the stream with conversation ID in header
  return result.toDataStreamResponse({
    headers: {
      'X-Conversation-Id': conversationId.toString()
    }
  });
  } catch (error) {
    logger.error('[stream-final] Error in chat stream:', error);
    
    // Return a proper error response for non-streaming errors
    // Check if this is a critical error that should stop execution
    if (error instanceof Error && error.message.includes('Model not found')) {
      return new Response('Model not found', { status: 404 });
    }
    
    // For other errors, try to continue with streaming if possible
    // This allows the chat to work even if there are minor issues
    throw error;
  }
}