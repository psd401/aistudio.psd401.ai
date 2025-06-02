"use server"

import { getAuth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db/db"
import { conversationsTable, messagesTable, aiModelsTable } from "@/db/schema"
import { eq } from "drizzle-orm"
import { generateCompletion } from "@/lib/ai-helpers"
import { CoreMessage } from "ai"
import { withErrorHandling, unauthorized, badRequest } from "@/lib/api-utils"
import { createError } from "@/lib/error-utils"
import { getDocumentsByConversationId, getDocumentChunksByDocumentId } from "@/lib/db/queries/documents"
import logger from "@/lib/logger"

export async function POST(req: NextRequest) {
  const { userId } = getAuth(req)
  if (!userId) {
    return unauthorized('User not authenticated')
  }

  return withErrorHandling(async () => {
    // Destructure conversationId from body
    const { messages, modelId: textModelId, source, executionId, context, conversationId: existingConversationId } = await req.json()

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
    const [aiModel] = await db
      .select()
      .from(aiModelsTable)
      .where(eq(aiModelsTable.modelId, textModelId))

    if (!aiModel) {
      throw createError(`AI Model with identifier '${textModelId}' not found`, {
        code: 'NOT_FOUND',
        level: 'error',
        details: { modelId: textModelId }
      });
    }

    let conversationIdToUse: number;
    let title = "Follow-up Conversation";

    // Check if conversation exists
    if (existingConversationId) {
      const [existingConversation] = await db
        .select()
        .from(conversationsTable)
        .where(eq(conversationsTable.id, existingConversationId))
      
      if (!existingConversation || existingConversation.clerkId !== userId) {
        throw createError("Conversation not found or access denied", {
          code: 'FORBIDDEN',
          level: 'warn',
          details: { conversationId: existingConversationId }
        });
      }
      
      conversationIdToUse = existingConversationId;
      title = existingConversation.title;
      // Update timestamp
      await db
        .update(conversationsTable)
        .set({ updatedAt: new Date() })
        .where(eq(conversationsTable.id, existingConversationId));
        
    } else {
      // Create a new conversation
      title = messages[0].content.slice(0, 100); // Use first message for title
      const [newConversation] = await db
        .insert(conversationsTable)
        .values({
          clerkId: userId,
          title: title,
          modelId: textModelId, // Use the text model_id for the foreign key
          source: source || "chat",
          executionId: executionId || null,
          context: context || null
        })
        .returning();
      conversationIdToUse = newConversation.id;
    }

    // Insert only the NEW user message
    const userMessage = messages[messages.length - 1];
    await db.insert(messagesTable).values({
      conversationId: conversationIdToUse,
      role: userMessage.role,
      content: userMessage.content
    });

    // --- Fetch previous messages for AI context --- 
    const previousMessages = await db
      .select({ role: messagesTable.role, content: messagesTable.content })
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, conversationIdToUse))
      .orderBy(messagesTable.createdAt);

    // --- Fetch documents and relevant content for AI context ---
    let documentContext = "";
    try {
      const documents = await getDocumentsByConversationId({ conversationId: conversationIdToUse });
      
      if (documents.length > 0) {
        // Get the user's latest message for context search
        const latestUserMessage = userMessage.content;
        
        // Get document chunks for all documents
        const documentChunksPromises = documents.map(doc => 
          getDocumentChunksByDocumentId({ documentId: doc.id })
        );
        const documentChunksArrays = await Promise.all(documentChunksPromises);
        const allDocumentChunks = documentChunksArrays.flat();

        // Simple keyword matching to find relevant chunks
        // In production, you'd use embedding-based semantic search
        const relevantChunks = allDocumentChunks
          .filter(chunk => {
            const content = chunk.content.toLowerCase();
            const message = latestUserMessage.toLowerCase();
            // Look for common words (3+ characters) from the user message in the chunks
            const keywords = message.split(/\s+/).filter(word => word.length > 2);
            return keywords.some(keyword => content.includes(keyword));
          })
          .sort((a, b) => {
            // Simple scoring by keyword frequency
            const aScore = allDocumentChunks.filter(chunk => 
              chunk.content.toLowerCase().includes(latestUserMessage.toLowerCase())
            ).length;
            const bScore = allDocumentChunks.filter(chunk => 
              chunk.content.toLowerCase().includes(latestUserMessage.toLowerCase())
            ).length;
            return bScore - aScore;
          })
          .slice(0, 3); // Top 3 most relevant chunks

        if (relevantChunks.length > 0) {
          const documentNames = documents.map(doc => doc.name).join(", ");
          documentContext = `\n\nRelevant content from uploaded documents (${documentNames}):\n\n${
            relevantChunks.map((chunk, index) => 
              `[Document Excerpt ${index + 1}]:\n${chunk.content}`
            ).join('\n\n')
          }\n\nPlease use this document content to answer the user's questions when relevant.`;
        }
      }
    } catch (docError) {
      logger.error("Error fetching document context", { 
        error: docError instanceof Error ? docError.message : String(docError),
        conversationId: conversationIdToUse,
        userId 
      });
      // Continue without document context if there's an error
    }
      
    // Construct messages for AI
    const baseSystemPrompt = source === "assistant_execution"
      ? "You are a helpful AI assistant having a follow-up conversation about the results of an AI tool execution. Use the context provided to help answer questions, but stay focused on topics related to the execution results. If a question is completely unrelated to the execution results, politely redirect the user to start a new chat for unrelated topics."
      : "You are a helpful AI assistant.";
    
    const systemPrompt = baseSystemPrompt + documentContext;
      
    const aiMessages: CoreMessage[] = [
      { role: 'system', content: systemPrompt },
      // Only include context if it's the first message (no previous messages)
      ...(previousMessages.length === 1 && context ? [{ role: 'system', content: `Context from execution: ${JSON.stringify(context)}` }] : []),
      // Include previous messages and the new user message
      ...previousMessages.map(msg => ({ role: msg.role as 'user' | 'assistant', content: msg.content }))
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
    await db.insert(messagesTable).values({
      conversationId: conversationIdToUse,
      role: "assistant",
      content: aiResponseContent
    });

    // Return data that will be wrapped in the standard response format
    return {
      text: aiResponseContent,
      conversationId: conversationIdToUse
    };
  });
}

export async function GET(req: NextRequest) {
  const { userId } = getAuth(req)
  if (!userId) {
    return unauthorized('User not authenticated')
  }

  const { searchParams } = new URL(req.url)
  const conversationId = searchParams.get('conversationId')
  if (!conversationId) {
    return badRequest('conversationId is required')
  }

  // Check that the conversation belongs to the user
  const [conversation] = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.id, conversationId))
  if (!conversation || conversation.clerkId !== userId) {
    return NextResponse.json({ error: 'Conversation not found or access denied' }, { status: 403 })
  }

  // Fetch all messages for the conversation, ordered by creation time
  const messages = await db
    .select({ id: messagesTable.id, role: messagesTable.role, content: messagesTable.content })
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, conversationId))
    .orderBy(messagesTable.createdAt)

  return NextResponse.json({ messages })
} 