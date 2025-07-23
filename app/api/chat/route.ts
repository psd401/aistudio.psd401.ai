"use server"

import { NextRequest, NextResponse } from "next/server"
import { generateCompletion } from "@/lib/ai-helpers"
import { CoreMessage } from "ai"
import { withErrorHandling, unauthorized, badRequest } from "@/lib/api-utils"
import { createError } from "@/lib/error-utils"
import { getDocumentsByConversationId, getDocumentChunksByDocumentId, getDocumentById } from "@/lib/db/queries/documents"
import { SelectDocument } from "@/types/db-types"
import logger from "@/lib/logger"
import { getCurrentUserAction } from "@/actions/db/get-current-user-action"
import { getServerSession } from "@/lib/auth/server-session"
import { executeSQL, FormattedRow } from "@/lib/db/data-api-adapter"

export async function POST(req: NextRequest) {
  const session = await getServerSession()
  if (!session) {
    return unauthorized('User not authenticated')
  }

  return withErrorHandling(async () => {
    // Destructure conversationId from body
    const { messages, modelId: textModelId, source, executionId, context, conversationId: existingConversationId, documentId } = await req.json()

    if (!textModelId) {
      throw createError('Model ID is required', {
        code: 'VALIDATION',
        level: 'warn',
        details: { field: 'modelId' }
      });
    }
    if (!messages || messages.length === 0) {
      throw createError('Messages are required', {
        code: 'VALIDATION',
        level: 'warn',
        details: { field: 'messages' }
      });
    }

    // Find the AI model record using the text modelId to get the provider
    const modelQuery = `
      SELECT id, name, provider, model_id
      FROM ai_models
      WHERE model_id = :modelId
      LIMIT 1
    `;
    const modelParams = [
      { name: 'modelId', value: { stringValue: textModelId } }
    ];
    const modelResult = await executeSQL(modelQuery, modelParams);
    
    if (!modelResult.length) {
      throw createError(`AI Model with identifier '${textModelId}' not found`, {
        code: 'NOT_FOUND',
        level: 'error',
        details: { modelId: textModelId }
      });
    }
    
    const aiModel = modelResult[0];
    
    // Ensure id is a number
    if (!aiModel.id) {
      throw createError('AI Model record missing id field', {
        code: 'INVALID_DATA',
        level: 'error',
        details: { model: aiModel }
      });
    }

    let conversationId: number | undefined;

    // If an existing conversation ID is provided, use it
    if (existingConversationId) {
      const checkQuery = `
        SELECT id FROM conversations
        WHERE id = :conversationId
      `;
      const checkParams = [
        { name: 'conversationId', value: { longValue: existingConversationId } }
      ];
      const conversations = await executeSQL(checkQuery, checkParams);

      if (conversations.length > 0) {
        conversationId = conversations[0].id
        // Update the updated_at timestamp
        const updateQuery = `
          UPDATE conversations
          SET updated_at = NOW()
          WHERE id = :conversationId
        `;
        await executeSQL(updateQuery, checkParams);
      }
    }

    // If no conversation ID is provided or found, create a new conversation
    if (!conversationId) {
      const currentUser = await getCurrentUserAction()
      if (!currentUser.isSuccess) {
        return new Response("Unauthorized", { status: 401 })
      }

      const insertQuery = `
        INSERT INTO conversations (title, user_id, model_id, source, execution_id, context)
        VALUES (:title, :userId, :modelId, :source, :executionId, :context::jsonb)
        RETURNING id
      `;
      const insertParams = [
        { name: 'title', value: { stringValue: messages[0].content.substring(0, 100) } },
        { name: 'userId', value: { longValue: currentUser.data.user.id } },
        { name: 'modelId', value: { longValue: aiModel.id } },
        { name: 'source', value: { stringValue: source || "chat" } },
        { name: 'executionId', value: executionId ? { longValue: executionId } : { isNull: true } },
        { name: 'context', value: context ? { stringValue: JSON.stringify(context) } : { isNull: true } }
      ];
      const newConversation = await executeSQL(insertQuery, insertParams);
      conversationId = newConversation[0].id
    }

    // Insert only the NEW user message
    const userMessage = messages[messages.length - 1];
    const insertMessageQuery = `
      INSERT INTO messages (conversation_id, role, content)
      VALUES (:conversationId, :role, :content)
    `;
    const insertMessageParams = [
      { name: 'conversationId', value: { longValue: conversationId } },
      { name: 'role', value: { stringValue: userMessage.role } },
      { name: 'content', value: { stringValue: userMessage.content } }
    ];
    await executeSQL(insertMessageQuery, insertMessageParams);

    // --- Fetch previous messages for AI context --- 
    const messagesQuery = `
      SELECT role, content
      FROM messages
      WHERE conversation_id = :conversationId
      ORDER BY created_at ASC
    `;
    const messagesParams = [
      { name: 'conversationId', value: { longValue: conversationId } }
    ];
    const previousMessages = await executeSQL<FormattedRow>(messagesQuery, messagesParams);

    // --- Fetch documents and relevant content for AI context ---
    let documentContext = "";
    try {
      let documents: SelectDocument[] = [];
      
      // If we have a conversationId, get documents linked to it
      if (conversationId) {
        documents = await getDocumentsByConversationId({ conversationId: conversationId });
      }
      
      // If a documentId was provided, also fetch that specific document
      // This ensures we include it even if linking hasn't completed yet
      if (documentId) {
        const singleDoc = await getDocumentById({ id: documentId });
        if (singleDoc && !documents.find((d: SelectDocument) => d.id === documentId)) {
          documents.push(singleDoc);
          logger.info(`Added document ${documentId} to context (total documents: ${documents.length})`);
        }
      }
      
      // Processing chat request
      
      if (documents.length > 0) {
        logger.info(`Found ${documents.length} documents for conversation ${conversationId}`);
        // Get the user's latest message for context search
        const latestUserMessage = userMessage.content;
        
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
        // In production, you'd use embedding-based semantic search
        
        // Check if user is asking about "this" or the document in general
        const generalDocumentQueries = ['this', 'document', 'file', 'pdf', 'uploaded', 'attachment'];
        const isGeneralDocumentQuery = generalDocumentQueries.some(term => 
          latestUserMessage.toLowerCase().includes(term)
        );
        
        let relevantChunks = [];
        
        if (isGeneralDocumentQuery || latestUserMessage.toLowerCase().includes('summar')) {
          // If asking about the document in general, include all chunks
          relevantChunks = allDocumentChunks.slice(0, 5); // Limit to first 5 chunks
        } else {
          // Otherwise, do keyword matching
          relevantChunks = allDocumentChunks
            .filter(chunk => {
              const content = chunk.content.toLowerCase();
              const message = latestUserMessage.toLowerCase();
              // Look for common words (3+ characters) from the user message in the chunks
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
          // Document exists but no chunks were found
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
      
    // Construct messages for AI
    const baseSystemPrompt = source === "assistant_execution"
      ? "You are a helpful AI assistant having a follow-up conversation about the results of an AI tool execution. Use the context provided to help answer questions, but stay focused on topics related to the execution results. If a question is completely unrelated to the execution results, politely redirect the user to start a new chat for unrelated topics."
      : "You are a helpful AI assistant.";
    
    const systemPrompt = baseSystemPrompt + documentContext;
      
    const aiMessages: CoreMessage[] = [
      { role: 'system' as const, content: systemPrompt },
      // Only include context if it's the first message (no previous messages)
      ...(previousMessages.length === 1 && context ? [{ role: 'system' as const, content: `Context from execution: ${JSON.stringify(context)}` }] : []),
      // Include previous messages and the new user message
      ...previousMessages.map(msg => ({ 
        role: (msg.role === 'user' ? 'user' : 'assistant') as const, 
        content: String(msg.content) 
      }))
    ];

    // Call the AI model using the helper function
    const aiResponseContent = await generateCompletion(
      {
        provider: aiModel.provider, // Use the provider from the fetched model
        modelId: textModelId // Use the text model_id for the AI call
      },
      aiMessages
    );

    // Save the assistant's response
    const saveAssistantQuery = `
      INSERT INTO messages (conversation_id, role, content)
      VALUES (:conversationId, :role, :content)
    `;
    const saveAssistantParams = [
      { name: 'conversationId', value: { longValue: conversationId } },
      { name: 'role', value: { stringValue: "assistant" } },
      { name: 'content', value: { stringValue: aiResponseContent } }
    ];
    await executeSQL(saveAssistantQuery, saveAssistantParams);

    // Return data that will be wrapped in the standard response format
    return {
      text: aiResponseContent,
      conversationId: conversationId
    };
  });
}

export async function GET(req: NextRequest) {
  const session = await getServerSession()
  if (!session) {
    return unauthorized('User not authenticated')
  }
  
  const currentUser = await getCurrentUserAction()
  if (!currentUser.isSuccess) {
    return unauthorized('User not found')
  }
  
  const userId = currentUser.data.user.id

  const { searchParams } = new URL(req.url)
  const conversationId = searchParams.get('conversationId')
  if (!conversationId) {
    return badRequest('conversationId is required')
  }

  // Check that the conversation belongs to the user
  const checkQuery = `
    SELECT id, user_id
    FROM conversations
    WHERE id = :conversationId
  `;
  const checkParams = [
    { name: 'conversationId', value: { longValue: parseInt(conversationId) } }
  ];
  const conversationResult = await executeSQL(checkQuery, checkParams);
  
  if (!conversationResult.length || conversationResult[0].user_id !== userId) {
    return NextResponse.json({ error: 'Conversation not found or access denied' }, { status: 403 })
  }

  // Fetch all messages for the conversation, ordered by creation time
  const messagesQuery = `
    SELECT id, role, content
    FROM messages
    WHERE conversation_id = :conversationId
    ORDER BY created_at ASC
  `;
  const messagesParams = [
    { name: 'conversationId', value: { longValue: parseInt(conversationId) } }
  ];
  const messages = await executeSQL<FormattedRow>(messagesQuery, messagesParams);

  return NextResponse.json({ messages })
} 