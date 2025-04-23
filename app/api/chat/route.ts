import { NextRequest } from 'next/server';
import { getAuth } from '@clerk/nextjs/server';
import { db } from '@/db/db';
import { messagesTable, conversationsTable } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { convertToCoreMessages, Message } from 'ai';
import { generateCompletion } from '@/lib/ai-helpers';

export const maxDuration = 300;

async function generateTitle(conversationMessages: Message[]) {
  console.log('[generateTitle] Starting title generation');
  // Simple title generation based on the first few words of the first user message
  // Avoids unnecessary LLM call for title generation for now
  const firstUserMessage = conversationMessages.find(m => m.role === 'user');
  const title = firstUserMessage 
    ? (typeof firstUserMessage.content === 'string' ? firstUserMessage.content : JSON.stringify(firstUserMessage.content)).split(' ').slice(0, 5).join(' ') 
    : 'New Conversation';
  console.log('[generateTitle] Generated title:', title);
  return title.trim();
}

export async function POST(req: NextRequest) {
  console.log('=== Starting chat request ===');
  
  try {
    const body = await req.json();
    console.log('[POST] Request body:', JSON.stringify(body, null, 2));
    // Destructure modelConfig from body
    const { messages: rawMessages, conversationId, modelConfig } = body; 
    
    const auth = getAuth(req);
    console.log('[POST] Auth:', { userId: auth.userId, conversationId, modelId: modelConfig?.modelId });

    const { userId } = auth;
    if (!userId) {
      console.log('[POST] Unauthorized - no userId');
      return new Response('Unauthorized', { status: 401 });
    }
    
    // Check if modelConfig is provided
    if (!modelConfig || !modelConfig.provider || !modelConfig.modelId) {
      console.error('[POST] Missing or invalid model configuration');
      return new Response('Model configuration is required', { status: 400 });
    }

    console.log('[POST] Converting messages to core format...');
    let coreMessages = convertToCoreMessages(rawMessages); // Use let to modify
    console.log('[POST] Raw core messages:', JSON.stringify(coreMessages, null, 2));

    // Define the system prompt
    const systemPrompt = 'You are a helpful AI assistant. Be concise and clear in your responses.';

    // Prepend the system prompt to the messages array if it's not already there
    // (Simple check: assumes system prompt is always the first message if present)
    if (!coreMessages.length || coreMessages[0].role !== 'system') {
      coreMessages = [
        { role: 'system', content: systemPrompt },
        ...coreMessages,
      ];
      console.log('[POST] Prepended system prompt.');
    }

    console.log('[POST] Final core messages with system prompt:', JSON.stringify(coreMessages, null, 2));

    // Get the last user message
    const lastUserMessage = coreMessages[coreMessages.length - 1];
    if (!lastUserMessage || lastUserMessage.role !== 'user') {
      console.error('[POST] No valid user message found at the end');
      return new Response('Invalid message sequence', { status: 400 });
    }

    const userMessageContent = typeof lastUserMessage.content === 'string' 
      ? lastUserMessage.content 
      : JSON.stringify(lastUserMessage.content);

    // Get model configuration from request body
    console.log('[POST] Model config from request:', modelConfig);

    // Generate response using ai-helpers with dynamic model config
    console.log('[POST] Generating response with ai-helpers...');
    const response = await generateCompletion(
      modelConfig, // Pass the modelConfig from the request
      // Pass the full message history (now including system prompt)
      coreMessages 
    );
    console.log('[POST] Generated response:', response);

    // Save to database
    console.log('=== Saving to database ===');
    let finalConversationId = conversationId; // Use let to allow modification
    
    await db.transaction(async (tx) => {
      // Handle conversation
      if (!finalConversationId) {
        console.log('[POST] Creating new conversation...');
        const [newConversation] = await tx
          .insert(conversationsTable)
          .values({
            clerkId: userId,
            title: userMessageContent.slice(0, 100), // Initial title
            modelId: modelConfig.modelId, // Use modelId from request
            updatedAt: new Date()
          })
          .returning();
        finalConversationId = newConversation.id; // Assign the new ID
        console.log('[POST] Created conversation:', newConversation);
      } else {
        console.log('[POST] Using existing conversation:', finalConversationId);
        await tx
          .update(conversationsTable)
          .set({ updatedAt: new Date() })
          .where(eq(conversationsTable.id, finalConversationId));
      }

      // Save messages
      console.log('[POST] Saving messages...');
      const messagesToSave = [
        {
          conversationId: finalConversationId,
          role: lastUserMessage.role as 'user' | 'assistant', // Ensure correct type
          content: userMessageContent,
          createdAt: new Date()
        },
        {
          conversationId: finalConversationId,
          role: 'assistant' as const,
          content: response,
          createdAt: new Date()
        }
      ];
      
      console.log('[POST] Messages to save:', JSON.stringify(messagesToSave, null, 2));
      await tx.insert(messagesTable).values(messagesToSave);

      // Generate and update title if it was a new conversation
      if (!conversationId) { // Only update title for new conversations for now
        console.log('[POST] Generating conversation title...');
        const savedMessages = await tx
          .select()
          .from(messagesTable)
          .where(eq(messagesTable.conversationId, finalConversationId))
          .orderBy(messagesTable.createdAt); // Order messages to ensure correct sequence
        
        const formattedMessages = savedMessages.map(msg => {
          // Map DB roles to the narrower set expected by Message type
          let role: "system" | "user" | "assistant" | "data";
          switch (msg.role) {
            case 'user':
            case 'assistant':
            case 'system':
            case 'data':
              role = msg.role;
              break;
            default:
              // Handle unexpected roles, maybe default to 'data' or log an error
              console.warn(`[POST] Unexpected message role from DB: ${msg.role}, defaulting to 'data'`);
              role = 'data';
          }
          
          return {
            id: String(msg.id),
            role: role,
            content: msg.content
          };
        }) as Message[]; // Assert type after mapping
        
        const title = await generateTitle(formattedMessages);
        console.log('[POST] Generated title:', title);

        await tx
          .update(conversationsTable)
          .set({
            title: title.slice(0, 100),
            updatedAt: new Date()
          })
          .where(eq(conversationsTable.id, finalConversationId));
      }

      console.log('[POST] Database transaction completed successfully');
    });

    console.log('[POST] Sending response');
    return new Response(response, {
      headers: { 'Content-Type': 'text/plain' }
    });
  } catch (error) {
    console.error('[POST] Route error:', error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: error.cause
    } : error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'An error occurred' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
} 