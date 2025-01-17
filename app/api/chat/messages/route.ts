import { StreamingTextResponse, LangChainStream } from 'ai';
import { getAuth } from '@clerk/nextjs/server';
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { db } from '@/lib/db';
import { messages, conversations, NewMessage, NewConversation } from '@/lib/schema';
import { eq } from 'drizzle-orm';

const bedrock = new BedrockRuntimeClient({
  region: process.env.BEDROCK_REGION,
  credentials: {
    accessKeyId: process.env.BEDROCK_ACCESS_KEY_ID!,
    secretAccessKey: process.env.BEDROCK_SECRET_ACCESS_KEY!,
  },
});

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

async function generateSummary(message: string, modelId: string): Promise<string> {
  try {
    const response = await bedrock.send(new InvokeModelCommand({
      modelId: `arn:aws:bedrock:${process.env.BEDROCK_REGION}::foundation-model/${modelId}`,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        messages: [{
          role: 'user',
          content: `Please provide a very brief summary (10 words or less) of what this message is about: "${message}"`
        }],
        max_tokens: 100,
        temperature: 0.7,
        top_k: 250,
        top_p: 0.999,
      }),
    }));

    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    const summary = responseBody.completion || responseBody.content[0].text;
    return summary.trim();
  } catch (error) {
    console.error('Error generating summary:', error);
    return message.slice(0, 100).replace(/\n/g, ' '); // Fallback to original behavior
  }
}

export async function POST(req: Request) {
  const { userId } = getAuth(req);
  
  if (!userId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { messages: chatMessages, conversationId, modelId: selectedModelId } = await req.json();
  const userMessage = chatMessages[chatMessages.length - 1];

  try {
    let activeConversationId = conversationId;

    // For a new chat, create the conversation first
    if (!activeConversationId) {
      // Generate a summary for the conversation title
      const title = await generateSummary(userMessage.content, selectedModelId);

      const newConversation: NewConversation = {
        clerkId: userId,
        title,
        modelId: selectedModelId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const [conversation] = await db.insert(conversations)
        .values(newConversation)
        .returning();
      
      activeConversationId = conversation.id;
    } else {
      // Update the conversation's updatedAt timestamp
      await db.update(conversations)
        .set({ updatedAt: new Date() })
        .where(eq(conversations.id, activeConversationId));
    }

    // Save the user's message
    const newMessage: NewMessage = {
      conversationId: activeConversationId,
      role: 'user',
      content: userMessage.content,
      createdAt: new Date(),
    };

    await db.insert(messages).values(newMessage);

    // Prepare the conversation history for the AI
    const prompt = chatMessages.map((msg: ChatMessage) => ({
      role: msg.role,
      content: msg.content,
    }));

    // Get AI response
    const response = await bedrock.send(new InvokeModelCommand({
      modelId: `arn:aws:bedrock:${process.env.BEDROCK_REGION}::foundation-model/${selectedModelId}`,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        messages: prompt,
        max_tokens: 4096,
        temperature: 0.7,
        top_k: 250,
        top_p: 0.999,
      }),
    }));

    // Parse and save the AI response
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    const assistantMessage = responseBody.completion || responseBody.content[0].text;

    const newAssistantMessage: NewMessage = {
      conversationId: activeConversationId,
      role: 'assistant',
      content: assistantMessage,
      createdAt: new Date(),
    };

    await db.insert(messages).values(newAssistantMessage);

    // Return the AI response in the format expected by the Vercel AI SDK
    return new Response(
      JSON.stringify({
        role: 'assistant',
        content: assistantMessage,
        id: `msg_${Date.now()}`
      }),
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
  } catch (error) {
    console.error('Error processing message:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
} 