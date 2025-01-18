import { streamText, convertToCoreMessages, type Message } from 'ai';
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { getAuth } from '@clerk/nextjs/server';
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { messages, conversations, aiModels } from '@/lib/schema';
import { eq } from 'drizzle-orm';

const PROVIDER_MODEL_ID = 'anthropic.claude-3-haiku-20240307-v1:0';

console.log('Bedrock Config:', {
  region: process.env.BEDROCK_REGION,
  hasAccessKey: !!process.env.BEDROCK_ACCESS_KEY_ID,
  hasSecretKey: !!process.env.BEDROCK_SECRET_ACCESS_KEY
});

const bedrock = createAmazonBedrock({
  bedrockOptions: {
    region: process.env.BEDROCK_REGION!,
    credentials: {
      accessKeyId: process.env.BEDROCK_ACCESS_KEY_ID!,
      secretAccessKey: process.env.BEDROCK_SECRET_ACCESS_KEY!
    }
  }
});

export const maxDuration = 300;

async function generateTitle(conversationMessages: Message[]) {
  const titleResponse = await streamText({
    model: bedrock(PROVIDER_MODEL_ID),
    messages: [
      {
        role: 'user',
        content: `Given this conversation, generate a very short (3-5 words) title that captures its essence:\n\n${conversationMessages.map(m => `${m.role}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`).join('\n')}`
      }
    ],
    system: 'You are a helpful AI assistant. Generate only the title text, nothing else.',
  });

  let title = '';
  const stream = titleResponse.textStream;
  for await (const chunk of stream) {
    title += chunk;
  }
  return title.trim();
}

export async function POST(req: NextRequest) {
  console.log('=== Starting chat request ===');
  const { messages: rawMessages, conversationId, model: modelId } = await req.json();
  console.log('Raw request payload:', { userId: getAuth(req).userId, conversationId, modelId, messages: rawMessages });

  const { userId } = getAuth(req);
  if (!userId) {
    console.log('Unauthorized request - no userId');
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    console.log('Converting messages to core format...');
    const coreMessages = convertToCoreMessages(rawMessages);
    console.log('Core messages:', JSON.stringify(coreMessages, null, 2));

    console.log('Initializing stream with Bedrock...');
    const result = await streamText({
      model: bedrock(PROVIDER_MODEL_ID),
      messages: coreMessages,
      system: 'You are a helpful AI assistant. Be concise and clear in your responses.',
      onFinish: async ({ text }) => {
        console.log('=== Stream finished, saving to database ===');
        if (!text) {
          console.warn('No response text received');
          return;
        }

        try {
          await db.transaction(async (tx) => {
            // Handle conversation
            let activeConversationId = conversationId;
            
            if (!activeConversationId) {
              // Only create a new conversation if we don't have one
              console.log('Creating new conversation...');
              const [newConversation] = await tx
                .insert(conversations)
                .values({
                  clerkId: userId,
                  title: rawMessages[rawMessages.length - 1].content.slice(0, 100),
                  modelId: modelId,
                  updatedAt: new Date()
                })
                .returning();
              activeConversationId = newConversation.id;
              console.log('Created conversation:', newConversation);
            } else {
              // Update existing conversation's timestamp
              console.log('Using existing conversation:', activeConversationId);
              await tx
                .update(conversations)
                .set({ updatedAt: new Date() })
                .where(eq(conversations.id, activeConversationId));
            }

            // Save messages
            console.log('Saving messages...');
            const lastUserMessage = coreMessages[coreMessages.length - 1];
            const userMessageContent = typeof lastUserMessage.content === 'string' 
              ? lastUserMessage.content 
              : JSON.stringify(lastUserMessage.content);

            const messagesToSave = [
              // Only save the last message from the user
              {
                conversationId: activeConversationId,
                role: lastUserMessage.role,
                content: userMessageContent,
                createdAt: new Date()
              },
              // Save the assistant's response
              {
                conversationId: activeConversationId,
                role: 'assistant',
                content: text,
                createdAt: new Date()
              }
            ];
            
            console.log('Messages to save:', JSON.stringify(messagesToSave, null, 2));
            await tx.insert(messages).values(messagesToSave);

            // Generate and update title after saving messages
            console.log('Generating conversation title...');
            const savedMessages = await tx
              .select()
              .from(messages)
              .where(eq(messages.conversationId, activeConversationId));
            
            const formattedMessages = savedMessages.map(msg => ({
              id: String(msg.id),
              role: msg.role as "system" | "user" | "assistant" | "data",
              content: msg.content
            }));
            
            const title = await generateTitle(formattedMessages);
            console.log('Generated title:', title);

            await tx
              .update(conversations)
              .set({
                title: title.slice(0, 100),
                updatedAt: new Date()
              })
              .where(eq(conversations.id, activeConversationId));

            console.log('Database transaction completed successfully');
          });
        } catch (error) {
          console.error('Database error:', error instanceof Error ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
            cause: error.cause
          } : error);
        }
      }
    });

    console.log('Stream initialized, converting to response...');
    return result.toTextStreamResponse();
  } catch (error) {
    console.error('Route error:', error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: error.cause
    } : error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'An error occurred' }),
      { status: 500 }
    );
  }
} 