"use server"

import { getAuth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db/db"
import { conversationsTable, messagesTable, aiModelsTable } from "@/db/schema"
import { eq } from "drizzle-orm"
import { generateCompletion } from "@/lib/ai-helpers"
import { CoreMessage } from "ai"

export async function POST(req: NextRequest) {
  const { userId } = getAuth(req)
  if (!userId) {
    return new NextResponse("Unauthorized", { status: 401 })
  }

  try {
    // Destructure conversationId from body
    const { messages, modelId: textModelId, source, executionId, context, conversationId: existingConversationId } = await req.json()

    if (!textModelId) {
      throw new Error("Model ID is required");
    }
    if (!messages || messages.length === 0) {
      throw new Error("Messages are required");
    }

    // Find the AI model record using the text modelId to get the provider
    const [aiModel] = await db
      .select()
      .from(aiModelsTable)
      .where(eq(aiModelsTable.modelId, textModelId))

    if (!aiModel) {
      throw new Error(`AI Model with identifier '${textModelId}' not found`);
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
        throw new Error("Conversation not found or access denied");
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
      
    // Construct messages for AI
    const systemPrompt = source === "assistant_execution"
      ? "You are a helpful AI assistant having a follow-up conversation about the results of an AI tool execution. Use the context provided to help answer questions, but stay focused on topics related to the execution results. If a question is completely unrelated to the execution results, politely redirect the user to start a new chat for unrelated topics."
      : "You are a helpful AI assistant."
      
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
    })

    // Return only the text content and conversation ID
    return NextResponse.json({
      text: aiResponseContent,
      conversationId: conversationIdToUse
    })
  } catch (error) {
    console.error("Error in chat API:", error)
    return new NextResponse(
      JSON.stringify({ error: error instanceof Error ? error.message : "Failed to process chat message" }),
      { status: 500 }
    )
  }
} 