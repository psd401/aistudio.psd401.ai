import { NextRequest } from 'next/server';
import { getAuth } from '@clerk/nextjs/server';
import { db } from '@/db/db';
import { messagesTable, conversationsTable, documentsTable } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { convertToCoreMessages, Message } from 'ai';
import { generateCompletion } from '@/lib/ai-helpers';
import { getDocumentsByConversationId, getDocumentChunksByDocumentId } from '@/lib/db/queries/documents';
import { CoreMessage } from 'ai';

export const maxDuration = 300;

async function generateTitle(conversationMessages: Message[]) {
  console.log('[generateTitle] Starting title generation');
  
  try {
    // Only generate title if we have messages
    if (conversationMessages.length === 0) {
      return 'New Conversation';
    }

    // Ensure we have at least a user message and potentially an assistant response
    const relevantMessages = conversationMessages.filter(m => m.role === 'user' || m.role === 'assistant');
    if (relevantMessages.length === 0) {
      return 'New Conversation';
    }

    // Create messages for the AI to generate a title
    const messages: CoreMessage[] = [
      {
        role: 'system',
        content: 'You are an expert at creating very concise (3-5 words) titles for conversations. Respond *only* with the title, no explanations, quotation marks, or other text.'
      },
      {
        role: 'user',
        content: `Based on the following initial exchange, generate a concise 3-5 word title summarizing the main topic:\n\n${relevantMessages.map(m => `${m.role}: ${m.content}`).join('\n')}`
      }
    ];

    // Use the same model configuration as chat but with different messages
    const modelConfig = {
      provider: 'azure', // Use the same provider as chat
      modelId: 'gpt-35-turbo' // Use the same model as chat
    };

    // Generate title using our helper
    const title = await generateCompletion(modelConfig, messages);
    console.log('[generateTitle] Generated title:', title);
    // Clean up potential model artifacts like quotes
    return title.trim().replace(/^"|"$/g, ''); 
  } catch (error) {
    console.error('[generateTitle] Error generating title:', error);
    // Fallback to first message if AI title generation fails
    const firstUserMessage = conversationMessages.find(m => m.role === 'user');
    return firstUserMessage 
      ? (typeof firstUserMessage.content === 'string' ? firstUserMessage.content : JSON.stringify(firstUserMessage.content)).split(' ').slice(0, 5).join(' ') 
      : 'New Conversation';
  }
}

// Function to retrieve relevant document chunks based on a query
async function getRelevantDocumentChunks(conversationId: number, query: string): Promise<string[]> {
  try {
    console.log('[getRelevantDocumentChunks] Starting search for conversation:', conversationId, 'Query:', query);
    
    // Get documents for this conversation
    const documents = await getDocumentsByConversationId({ conversationId });
    console.log('[getRelevantDocumentChunks] Found', documents.length, 'documents for conversation');
    
    if (!documents || documents.length === 0) {
      console.log('[getRelevantDocumentChunks] No documents found, returning empty array');
      return [];
    }

    // Log the documents found
    console.log('[getRelevantDocumentChunks] Document details:', documents.map(doc => ({
      id: doc.id,
      name: doc.name,
      type: doc.type,
      size: doc.size
    })));

    // Get all document chunks for these documents
    console.log('[getRelevantDocumentChunks] Fetching chunks for documents...');
    const chunksPromises = documents.map(doc => 
      getDocumentChunksByDocumentId({ documentId: doc.id })
    );
    const chunksArrays = await Promise.all(chunksPromises);
    const allChunks = chunksArrays.flat();
    console.log('[getRelevantDocumentChunks] Found', allChunks.length, 'total chunks across all documents');

    // If no chunks found, return empty array
    if (allChunks.length === 0) {
      console.log('[getRelevantDocumentChunks] No chunks found for the documents, returning empty array');
      return [];
    }

    // Split query into keywords for better matching
    const queryKeywords = query.toLowerCase().split(/\s+/).filter(word => word.length > 3);
    console.log('[getRelevantDocumentChunks] Query keywords:', queryKeywords);

    // Simple text search for relevant chunks 
    // In a production environment, use vector embeddings for better semantic search
    const relevantChunks = allChunks
      .map(chunk => {
        const doc = documents.find(d => d.id === chunk.documentId);
        
        // Calculate relevance score - number of query keywords found in chunk
        let score = 0;
        const chunkText = chunk.content.toLowerCase();
        
        // First check if the full query appears
        if (chunkText.includes(query.toLowerCase())) {
          score += 10; // Higher score for exact matches
        }
        
        // Then check for individual keywords
        for (const keyword of queryKeywords) {
          if (chunkText.includes(keyword)) {
            score += 1;
          }
        }
        
        return {
          chunk,
          document: doc,
          score,
          content: `From document "${doc?.name || 'Document'}": ${chunk.content}`
        };
      })
      .filter(item => item.score > 0) // Only keep chunks with matches
      .sort((a, b) => b.score - a.score) // Sort by relevance score
      .slice(0, 5); // Take top 5 most relevant chunks

    console.log('[getRelevantDocumentChunks] Found', relevantChunks.length, 'relevant chunks');
    
    if (relevantChunks.length > 0) {
      console.log('[getRelevantDocumentChunks] Top chunk scores:', relevantChunks.map(c => c.score));
      return relevantChunks.map(item => item.content);
    }
    
    // If no relevant chunks found but we have documents, return the first few chunks
    // as a fallback - they might still be useful for context
    if (allChunks.length > 0) {
      console.log('[getRelevantDocumentChunks] No relevant chunks found, using fallback: returning first few chunks');
      return allChunks.slice(0, 3).map(chunk => {
        const doc = documents.find(d => d.id === chunk.documentId);
        return `From document "${doc?.name || 'Document'}": ${chunk.content}`;
      });
    }
    
    console.log('[getRelevantDocumentChunks] No chunks to return');
    return [];
  } catch (error) {
    console.error('[getRelevantDocumentChunks] Error retrieving document chunks:', error);
    return [];
  }
}

export async function POST(req: NextRequest) {
  console.log('=== Starting chat request ===');
  
  try {
    const body = await req.json();
    console.log('[POST] Request body:', JSON.stringify(body, null, 2));
    // Destructure modelConfig from body
    const { messages: rawMessages, conversationId, modelConfig, includeDocumentContext = true, documentId } = body; 
    
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
    let systemPrompt = 'You are a helpful AI assistant. Be concise and clear in your responses.';

    // Include document context if documentId is provided
    let injectedDocumentChunks: string[] = [];
    if (documentId) {
      // Fetch chunks for the provided documentId
      const docChunks = await getDocumentChunksByDocumentId({ documentId });
      if (docChunks.length > 0) {
        injectedDocumentChunks = docChunks.map(chunk => `From document: ${chunk.content}`);
        systemPrompt = `You are a helpful AI assistant with access to the following document extracts (uploaded by the user):\n\n${injectedDocumentChunks.join('\n\n')}\n\nUse these as your primary source when answering. If the answer is not in the document, say so.`;
        console.log('[POST] Injected document context from documentId into system prompt.');
      }
    }

    // If we have a conversationId and documentContext flag is true, check for documents
    if (conversationId && includeDocumentContext && !documentId) { // Only skip if documentId already handled
      console.log('[POST] Checking if conversation has documents...');
      
      // First check if this conversation has any documents
      const documents = await getDocumentsByConversationId({ conversationId });
      console.log(`[POST] Found ${documents.length} documents for conversation ${conversationId}`);
      
      if (documents.length > 0) {
        console.log('[POST] Documents found, retrieving relevant context...');
        
        // Get search queries from user messages - consider multiple messages for better context
        const userMessages = coreMessages.filter(msg => msg.role === 'user');
        console.log(`[POST] Found ${userMessages.length} user messages for document search`);
        
        // Use the last 2 user messages for search or just the last one if there's only one
        const messagesToSearch = userMessages.length > 1 
          ? userMessages.slice(-2) 
          : userMessages;
        
        // Extract content from messages and combine for search
        const searchQueries = messagesToSearch.map(msg => 
          typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
        );
        
        console.log('[POST] Using search queries from user messages:', searchQueries);
        
        // Get document chunks for each query and combine results
        const documentChunksPromises = searchQueries.map(query => 
          getRelevantDocumentChunks(conversationId, query)
        );
        const documentChunksArrays = await Promise.all(documentChunksPromises);
        
        // Flatten and deduplicate chunks (they might have overlapping results)
        const allDocumentChunks = Array.from(new Set(documentChunksArrays.flat()));
        
        console.log(`[POST] Found ${allDocumentChunks.length} total unique document chunks`);
        
        if (allDocumentChunks.length > 0) {
          // Update system prompt with document context
          systemPrompt = `
You are a helpful AI assistant with access to the following document extracts:

${allDocumentChunks.join('\n\n')}

Guidelines for answering questions:
1. Use the information from these documents as your primary source when answering.
2. ALWAYS cite the specific document name when using information from it (e.g., "According to [Document Name]...").
3. If the documents contain the answer, base your response primarily on that content.
4. If the documents don't contain enough information, clearly state "The documents don't provide sufficient information about this" and then use your general knowledge.
5. Be concise and clear.
6. Never fabricate information from the documents - only use what's actually provided in the extracts.
7. If the user asks about the documents directly, you can explain what documents you have access to and summarize their content.

Your primary purpose is to help the user understand and use the information in these documents.
`;
          console.log('[POST] Enhanced system prompt with document context');
        } else {
          // Even if no specific chunks matched the query, still let the AI know about the documents
          const documentNames = documents.map(doc => doc.name);
          systemPrompt = `
You are a helpful AI assistant. The user has uploaded the following documents: ${documentNames.join(', ')}.

However, I couldn't find specific information in these documents relevant to the current query. When responding:
1. Let the user know which documents you have access to if they ask.
2. Feel free to use your general knowledge to answer their questions.
3. Suggest that the user could ask more specific questions about the documents if they want information from them.
4. Be concise and clear in your responses.
`;
          console.log('[POST] No relevant chunks found, using document-aware general prompt');
        }
      } else {
        console.log('[POST] No documents found for this conversation, using standard system prompt');
      }
    } else if (!includeDocumentContext) {
      console.log('[POST] Document context explicitly disabled, using standard system prompt');
    }

    // Prepend the system prompt to the messages array if it's not already there
    // (Simple check: assumes system prompt is always the first message if present)
    if (!coreMessages.length || coreMessages[0].role !== 'system') {
      coreMessages = [
        { role: 'system', content: systemPrompt },
        ...coreMessages,
      ];
      console.log('[POST] Prepended system prompt.');
    } else {
      // Replace existing system prompt with our enhanced one
      coreMessages[0].content = systemPrompt;
      console.log('[POST] Updated system prompt with document context.');
    }

    console.log('[POST] Final system prompt:', coreMessages[0].content);

    // Get the last user message
    const finalUserMessage = coreMessages[coreMessages.length - 1];
    if (!finalUserMessage || finalUserMessage.role !== 'user') {
      console.error('[POST] No valid user message found at the end');
      return new Response('Invalid message sequence', { status: 400 });
    }

    const finalUserMessageContent = typeof finalUserMessage.content === 'string' 
      ? finalUserMessage.content 
      : JSON.stringify(finalUserMessage.content);

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
    let justCreatedConversation = false;
    
    await db.transaction(async (tx) => {
      // Handle conversation
      if (!finalConversationId) {
        console.log('[POST] Creating new conversation...');
        const [newConversation] = await tx
          .insert(conversationsTable)
          .values({
            clerkId: userId,
            title: finalUserMessageContent.slice(0, 100), // Initial title
            modelId: modelConfig.modelId, // Use modelId from request
            updatedAt: new Date()
          })
          .returning();
        finalConversationId = newConversation.id; // Assign the new ID
        justCreatedConversation = true;
        
        // If a documentId was provided, link it to this conversation **within
        // the same DB transaction** so that the foreign-key constraint sees
        // the newly inserted conversation row.  Using `tx` instead of the
        // global `db` avoids the cross-transaction FK violation we observed.
        if (documentId) {
          console.log(`[POST] Linking document ${documentId} to new conversation ${finalConversationId} (transaction)`);
          try {
            await tx
              .update(documentsTable)
              .set({ conversationId: finalConversationId, updatedAt: new Date() })
              .where(eq(documentsTable.id, documentId));
            console.log(`[POST] Successfully linked document ${documentId}`);
          } catch (linkError) {
            console.error(`[POST] Failed to link document ${documentId} within transaction:`, linkError);
          }
        }
        
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
          role: finalUserMessage.role as 'user' | 'assistant', // Ensure correct type
          content: finalUserMessageContent,
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
    if (justCreatedConversation) {
      return new Response(
        JSON.stringify({ text: response, conversationId: finalConversationId }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }
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