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
export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) {
      return new Response('Unauthorized', { status: 401 });
    }

    const { messages, modelId: textModelId, conversationId: existingConversationId, documentId, source, executionId, context } = await req.json();

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
  
  // Log for debugging
  logger.info('[stream-final] Model resolved:', {
    textModelId,
    isNumericId,
    aiModelId: aiModel?.id,
    aiModelName: aiModel?.name,
    aiModelProvider: aiModel?.provider,
    aiModelStringId: aiModel?.modelId
  });
  
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
      { name: 'context', value: context ? { stringValue: JSON.stringify(context) } : { isNull: true } }
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
        logger.info(`Added document ${documentId} to context (total documents: ${documents.length})`);
      }
    }
    
    logger.info(`Processing chat with conversationId: ${conversationId}, documentId: ${documentId}, found ${documents.length} documents`);
    
    if (documents.length > 0) {
      logger.info(`Found ${documents.length} documents for conversation ${conversationId}`);
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
        logger.info("No chunks found immediately, waiting 500ms for chunks to be saved...");
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const retryChunksPromises = documents.map(doc => 
          getDocumentChunksByDocumentId({ documentId: doc.id })
        );
        const retryChunksArrays = await Promise.all(retryChunksPromises);
        allDocumentChunks = retryChunksArrays.flat();
      }
      
      logger.info(`Found ${allDocumentChunks.length} total chunks`);

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
        logger.info(`Including ${relevantChunks.length} relevant chunks in AI context`);
      } else if (allDocumentChunks.length === 0 && documents.length > 0) {
        documentContext = `\n\nNote: A document was uploaded but its content could not be extracted or is still being processed. The document name is: ${documents.map(d => d.name).join(", ")}`;
        logger.warn(`Document exists but no chunks found for documents: ${documents.map(d => d.id).join(", ")}`);
      } else {
        logger.info(`No relevant chunks found for message: "${latestUserMessage}"`);
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

  // Retrieve execution context if this conversation is linked to an execution
  let executionContext = "";
  let fullContext = context;
  
  if (existingConversationId) {
    // Validate conversationId before query
    const parsedConvId = typeof existingConversationId === 'string' ? parseInt(existingConversationId, 10) : existingConversationId;
    if (isNaN(parsedConvId) || parsedConvId <= 0) {
      logger.warn('Invalid conversationId provided', { conversationId: existingConversationId });
    } else {
      // First, get conversation data
      const conversationData = await executeSQL(
        `SELECT c.context, c.execution_id
        FROM conversations c
        WHERE c.id = :conversationId`,
        [{ name: 'conversationId', value: { longValue: parsedConvId } }]
      );
      
      if (conversationData.length > 0) {
        const conversation = conversationData[0];
        
        // Parse stored context with error handling
        try {
          const contextStr = conversation.context as string | null;
          fullContext = contextStr ? JSON.parse(contextStr) : null;
          // Validate context structure
          if (fullContext && typeof fullContext !== 'object') {
            throw new Error('Invalid context format');
          }
          // Validate context size - smart truncation instead of nullifying
          if (fullContext && JSON.stringify(fullContext).length > 100000) {
            logger.warn('Context data too large, applying smart truncation', { 
              conversationId: parsedConvId,
              contextSize: JSON.stringify(fullContext).length
            });
            // Preserve core context while truncating prompt results
            if (fullContext.promptResults && Array.isArray(fullContext.promptResults)) {
              const truncatedContext = {
                ...fullContext,
                promptResults: fullContext.promptResults.slice(0, 5), // Keep first 5 results
                truncated: true,
                originalPromptCount: fullContext.promptResults.length
              };
              fullContext = truncatedContext;
              logger.info('Context truncated to preserve core data', {
                originalPromptCount: fullContext.originalPromptCount,
                keptPromptCount: 5
              });
            }
          }
        } catch (parseError) {
          logger.warn('Failed to parse conversation context', { 
            conversationId: parsedConvId, 
            contextLength: conversation.context ? String(conversation.context).length : 0,
            error: parseError instanceof Error ? parseError.message : 'Unknown error' 
          });
          fullContext = null;
        }
        
        // If there's an execution_id, fetch execution details separately
        if (conversation.execution_id) {
          // Validate executionId
          const execId = typeof conversation.execution_id === 'number' ? conversation.execution_id : parseInt(String(conversation.execution_id), 10);
          if (!isNaN(execId) && execId > 0) {
            // Get execution details and prompt results in parallel for better performance
            const [executionData, promptResults] = await Promise.all([
              executeSQL(
                `SELECT te.input_data, te.status as exec_status, te.started_at, te.completed_at,
                        aa.name as tool_name, aa.description as tool_description
                FROM tool_executions te
                LEFT JOIN assistant_architects aa ON te.assistant_architect_id = aa.id
                WHERE te.id = :executionId`,
                [{ name: 'executionId', value: { longValue: execId } }]
              ),
              executeSQL(
                `SELECT pr.prompt_id, pr.input_data as prompt_input, pr.output_data, 
                        pr.status as prompt_status, cp.name as prompt_name
                FROM prompt_results pr
                LEFT JOIN chain_prompts cp ON pr.prompt_id = cp.id
                WHERE pr.execution_id = :executionId
                ORDER BY pr.started_at ASC`,
                [{ name: 'executionId', value: { longValue: execId } }]
              )
            ]);
            
            if (executionData.length > 0) {
              const execution = executionData[0];
              
              // Build execution context
              executionContext = `\n\nExecution Context:
Tool: ${execution.tool_name}
Description: ${execution.tool_description}
Execution Status: ${execution.exec_status}
Original Inputs: ${execution.input_data}

Prompt Results:
${promptResults.map((pr, idx) => `
${idx + 1}. ${pr.prompt_name}:
   Input: ${JSON.stringify(pr.prompt_input)}
   Output: ${pr.output_data}
   Status: ${pr.prompt_status}`).join('\n')}

This context provides the complete execution history that the user is asking about. Use this information to answer their questions accurately.`;
            }
          }
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
4. Stay focused on topics related to the execution results
5. If a question is completely unrelated to the execution, politely suggest starting a new chat

Remember: You have access to the complete execution history including all inputs, outputs, and prompt results. Use this information to provide accurate and helpful responses.`
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

  // Log before streaming
  logger.info('[stream-final] Starting stream with:', {
    conversationId,
    messageCount: aiMessages.length,
    modelProvider: aiModel.provider,
    modelId: aiModel.modelId
  });

  // Stream the response
  const result = await streamText({
    model,
    messages: aiMessages,
    onFinish: async ({ text }) => {
      logger.info('[stream-final] Stream finished with text length:', text?.length || 0);
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
        logger.info('[stream-final] Assistant response saved');
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