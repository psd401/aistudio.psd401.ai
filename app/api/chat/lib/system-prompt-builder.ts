import { createLogger } from '@/lib/logger';
import { getDocumentContext } from './document-context';
import { getExecutionContext } from './execution-context';
import { getKnowledgeContext } from './knowledge-context';
interface AuthSession {
  sub: string;
  [key: string]: unknown;
}

const log = createLogger({ module: 'system-prompt-builder' });

export interface SystemPromptOptions {
  source?: string;
  executionId?: number;
  conversationId?: number;
  documentId?: string;
  userMessage: string;
  session: AuthSession;
  existingContext?: {
    repositoryIds?: number[];
    assistantOwnerSub?: string;
  };
}

/**
 * Builds a comprehensive system prompt with all necessary context
 */
export async function buildSystemPrompt(options: SystemPromptOptions): Promise<string> {
  log.debug('Building system prompt', {
    source: options.source,
    hasExecutionId: !!options.executionId,
    hasDocumentId: !!options.documentId,
    hasConversationId: !!options.conversationId
  });
  
  // Start with base prompt based on source
  let systemPrompt = getBasePrompt(options.source);
  
  try {
    // Add document context if documents are involved
    if (options.documentId || options.conversationId) {
      log.debug('Adding document context');
      const documentContext = await getDocumentContext({
        conversationId: options.conversationId,
        documentId: options.documentId,
        userMessage: options.userMessage
      });
      
      if (documentContext) {
        systemPrompt += documentContext;
        log.debug('Document context added', { 
          contextLength: documentContext.length 
        });
      }
    }
    
    // Add execution context for assistant executions
    if (options.executionId) {
      log.debug('Adding execution context', { 
        executionId: options.executionId 
      });
      const executionContext = await getExecutionContext(options.executionId);
      
      if (executionContext) {
        systemPrompt += executionContext;
        log.debug('Execution context added', { 
          contextLength: executionContext.length 
        });
      }
    }
    
    // Add knowledge context for assistant executions (both initial and follow-ups)
    // This ensures the AI has access to repository knowledge during the initial execution
    if (options.source === 'assistant_execution' && options.existingContext?.repositoryIds && options.existingContext.repositoryIds.length > 0) {
      log.info('Checking knowledge context for assistant execution', {
        source: options.source,
        repositoryCount: options.existingContext.repositoryIds.length,
        repositoryIds: options.existingContext.repositoryIds,
        isInitialExecution: !!options.executionId && !options.conversationId,
        userMessage: options.userMessage.substring(0, 100),
        hasAssistantOwnerSub: !!options.existingContext.assistantOwnerSub
      });
      
      const knowledgeContext = await getKnowledgeContext({
        userMessage: options.userMessage,
        repositoryIds: options.existingContext.repositoryIds,
        userSub: options.session.sub,
        assistantOwnerSub: options.existingContext.assistantOwnerSub
      });
      
      if (knowledgeContext) {
        systemPrompt += knowledgeContext;
        log.info('Knowledge context added to system prompt', { 
          contextLength: knowledgeContext.length,
          isInitialExecution: !!options.executionId && !options.conversationId,
          totalPromptLength: systemPrompt.length
        });
      } else {
        log.warn('No knowledge context was returned', {
          repositoryIds: options.existingContext.repositoryIds,
          userMessage: options.userMessage.substring(0, 100)
        });
      }
    } else {
      log.info('Knowledge context not added', {
        source: options.source,
        hasRepositoryIds: !!options.existingContext?.repositoryIds,
        repositoryCount: options.existingContext?.repositoryIds?.length || 0,
        conditions: {
          isAssistantExecution: options.source === 'assistant_execution',
          hasContext: !!options.existingContext,
          hasRepoIds: !!options.existingContext?.repositoryIds,
          hasRepoIdsLength: (options.existingContext?.repositoryIds?.length || 0) > 0
        }
      });
    }
    
    log.debug('System prompt built successfully', { 
      totalLength: systemPrompt.length 
    });
    
  } catch (error) {
    log.error('Error building system prompt context', { error });
    // Continue with base prompt if context building fails
  }
  
  return systemPrompt;
}

/**
 * Get the base system prompt based on the source
 */
function getBasePrompt(source?: string): string {
  if (source === 'assistant_execution') {
    return `You are a helpful AI assistant having a follow-up conversation about the results of an AI tool execution. 

Key responsibilities:
1. Use the execution context provided to answer questions accurately about the tool execution
2. Reference specific prompt results when relevant to the user's questions
3. If asked about inputs, outputs, or the process, refer to the detailed execution history
4. When asked about the knowledge, context, or information the assistant was given, refer to the "Assistant Knowledge Base" section
5. When asked questions that require information from the knowledge repositories, use the dynamically retrieved knowledge to provide accurate answers
6. Stay focused on topics related to the execution results and the assistant's capabilities
7. If a question is completely unrelated to the execution, politely suggest starting a new chat

Remember: You have access to:
- The complete execution history including all inputs, outputs, and prompt results
- The assistant's knowledge base and system context that was used during execution
- The assistant's instructions and configuration
- Dynamic knowledge retrieval from the same repositories used during execution (when relevant to your question)
Use all this information to provide accurate and helpful responses about both what happened and why.`;
  }
  
  return 'You are a helpful AI assistant.';
}