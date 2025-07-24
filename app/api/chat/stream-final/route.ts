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
import escapeHtml from "escape-html";
import { getDocumentsByConversationId, getDocumentChunksByDocumentId, getDocumentById } from "@/lib/db/queries/documents";
export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { messages, modelId: textModelId, conversationId: existingConversationId, documentId, source, executionId, context } = await req.json();

  // Get model info
  const modelQuery = `
    SELECT id, name, provider, model_id
    FROM ai_models
    WHERE model_id = :modelId
    LIMIT 1
  `;
  const modelResult = await executeSQL<FormattedRow>(modelQuery, [
    { name: 'modelId', value: { stringValue: textModelId } }
  ]);
  
  if (!modelResult.length) {
    return new Response(`Model not found: ${escapeHtml(textModelId)}`, { status: 404 });
  }
  
  const aiModel = modelResult[0];
  
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
      { name: 'modelId', value: { longValue: aiModel.id } },
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
  
  switch (aiModel.provider) {
    case 'openai': {
      const key = await Settings.getOpenAI();
      if (!key) throw new Error('OpenAI key not configured');
      const openai = createOpenAI({ apiKey: key });
      model = openai(textModelId);
      break;
    }
    case 'azure': {
      const config = await Settings.getAzureOpenAI();
      if (!config.key || !config.resourceName) throw new Error('Azure not configured');
      const azure = createAzure({ apiKey: config.key, resourceName: config.resourceName });
      model = azure(textModelId);
      break;
    }
    case 'google': {
      const key = await Settings.getGoogleAI();
      if (!key) throw new Error('Google key not configured');
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = key;
      model = google(textModelId);
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
      model = bedrock(textModelId);
      break;
    }
    default:
      throw new Error(`Unknown provider: ${aiModel.provider}`);
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
      // For existing conversations, retrieve all context data in a single optimized query
      const contextData = await executeSQL(
        `SELECT 
          c.context, c.execution_id,
          te.input_data, te.status as exec_status, te.started_at, te.completed_at,
          aa.name as tool_name, aa.description as tool_description,
          pr.prompt_id, pr.input_data as prompt_input, pr.output_data, pr.status as prompt_status,
          cp.name as prompt_name
        FROM conversations c
        LEFT JOIN tool_executions te ON c.execution_id = te.id
        LEFT JOIN assistant_architects aa ON te.assistant_architect_id = aa.id
        LEFT JOIN prompt_results pr ON pr.execution_id = te.id
        LEFT JOIN chain_prompts cp ON pr.prompt_id = cp.id
        WHERE c.id = :conversationId
        ORDER BY pr.started_at ASC`,
        [{ name: 'conversationId', value: { longValue: parsedConvId } }]
      );
      
      if (contextData.length > 0) {
        const firstRow = contextData[0];
        
        // Parse stored context with error handling
        try {
          fullContext = firstRow.context ? JSON.parse(firstRow.context) : null;
        } catch (parseError) {
          logger.warn('Failed to parse conversation context', { 
            conversationId: parsedConvId, 
            error: parseError instanceof Error ? parseError.message : 'Unknown error' 
          });
          fullContext = null;
        }
        
        // If there's an execution_id, build the execution context
        if (firstRow.execution_id) {
          // Validate executionId
          const execId = typeof firstRow.execution_id === 'number' ? firstRow.execution_id : parseInt(firstRow.execution_id, 10);
          if (!isNaN(execId) && execId > 0) {
            // Group prompt results from the joined data
            const promptResults = contextData
              .filter(row => row.prompt_id !== null)
              .map(row => ({
                prompt_name: row.prompt_name,
                input_data: row.prompt_input,
                output_data: row.output_data,
                status: row.prompt_status
              }));
            
            // Build execution context
            executionContext = `\n\nExecution Context:
Tool: ${firstRow.tool_name}
Description: ${firstRow.tool_description}
Execution Status: ${firstRow.exec_status}
Original Inputs: ${firstRow.input_data}

Prompt Results:
${promptResults.map((pr, idx) => `
${idx + 1}. ${pr.prompt_name}:
   Input: ${JSON.stringify(pr.input_data)}
   Output: ${pr.output_data}
   Status: ${pr.status}`).join('\n')}

This context provides the complete execution history that the user is asking about. Use this information to answer their questions accurately.`;
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
      role: (msg.role === 'user' ? 'user' : 'assistant') as const, 
      content: String(msg.content) 
    }))
  ];

  // Stream the response
  const result = await streamText({
    model,
    messages: aiMessages,
    onFinish: async ({ text }) => {
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
}