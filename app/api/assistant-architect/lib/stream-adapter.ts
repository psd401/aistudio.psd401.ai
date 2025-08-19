import { streamText } from 'ai';
import { LanguageModel } from 'ai';

/**
 * Adapter to convert AI SDK's native streaming format to assistant architect's custom SSE format
 * This allows us to use the AI SDK's streaming (which works on AWS Amplify) while maintaining
 * compatibility with the existing UI.
 */

interface StreamAdapterOptions {
  model: LanguageModel;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  promptIndex: number;
  promptId: number;
  modelName: string;
  onToken?: (token: string) => void;
  onComplete?: (fullResponse: string) => void;
  onError?: (error: Error) => void;
}

/**
 * Creates a ReadableStream that adapts AI SDK streaming to custom SSE format
 */
export async function createAdaptedStream(options: StreamAdapterOptions): Promise<ReadableStream<Uint8Array>> {
  const { 
    model, 
    messages, 
    promptIndex, 
    promptId, 
    modelName,
    onToken,
    onComplete,
    onError
  } = options;

  const encoder = new TextEncoder();
  let fullResponse = '';
  let streamStarted = false;

  // Use AI SDK's streamText
  const result = streamText({
    model,
    messages: messages.map(m => ({
      role: m.role,
      content: String(m.content)
    }))
  });

  // Convert the AI SDK stream to our custom format
  return new ReadableStream({
    async start(controller) {
      try {
        // Send prompt start event
        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({
            type: 'prompt_start',
            promptIndex,
            promptId,
            modelName
          })}\n\n`
        ));

        // Send status event
        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({
            type: 'status',
            message: 'AI is responding...',
            promptIndex
          })}\n\n`
        ));

        // Process the AI SDK stream
        for await (const chunk of result.textStream) {
          // First token marks the stream as started
          if (!streamStarted) {
            streamStarted = true;
            controller.enqueue(encoder.encode(
              `data: ${JSON.stringify({
                type: 'status',
                message: 'Streaming response...',
                promptIndex
              })}\n\n`
            ));
          }

          fullResponse += chunk;

          // Send token event
          controller.enqueue(encoder.encode(
            `data: ${JSON.stringify({
              type: 'token',
              promptIndex,
              token: chunk
            })}\n\n`
          ));

          // Call token callback if provided
          if (onToken) {
            onToken(chunk);
          }
        }

        // Send prompt complete event
        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({
            type: 'prompt_complete',
            promptIndex,
            result: fullResponse
          })}\n\n`
        ));

        // Call complete callback if provided
        if (onComplete) {
          onComplete(fullResponse);
        }

        // Close the stream
        controller.close();
      } catch (error) {
        // Send error event
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({
            type: 'prompt_error',
            promptIndex,
            error: errorMessage
          })}\n\n`
        ));

        // Call error callback if provided
        if (onError) {
          onError(error instanceof Error ? error : new Error(errorMessage));
        }

        // Close the stream
        controller.close();
      }
    }
  });
}

/**
 * Helper to create a complete multi-prompt streaming response
 */
export function createMultiPromptStream(
  prompts: Array<{
    id: number;
    content: string;
    systemContext?: string;
    model: LanguageModel;
    modelName: string;
  }>,
  executionId: number,
  toolName: string
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        // Send initial metadata
        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({
            type: 'metadata',
            totalPrompts: prompts.length,
            toolName
          })}\n\n`
        ));

        const results: string[] = [];

        // Process each prompt sequentially
        for (let i = 0; i < prompts.length; i++) {
          const prompt = prompts[i];
          
          // Build messages for this prompt, including previous results
          const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
          
          if (prompt.systemContext) {
            messages.push({ role: 'system', content: prompt.systemContext });
          }

          // Process prompt template with previous results
          let processedPrompt = prompt.content;
          results.forEach((result, index) => {
            const placeholder = `{{result_${index + 1}}}`;
            processedPrompt = processedPrompt.replace(
              new RegExp(placeholder, 'g'),
              result
            );
          });

          messages.push({ role: 'user', content: processedPrompt });

          // Create adapted stream for this prompt
          const promptStream = await createAdaptedStream({
            model: prompt.model,
            messages,
            promptIndex: i,
            promptId: prompt.id,
            modelName: prompt.modelName,
            onComplete: (result) => {
              results.push(result);
            }
          });

          // Pipe the prompt stream to our output
          const reader = promptStream.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              controller.enqueue(value);
            }
          } finally {
            reader.releaseLock();
          }
        }

        // Send completion event
        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({
            type: 'complete',
            executionId
          })}\n\n`
        ));

        controller.close();
      } catch (error) {
        // Send error event
        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({
            type: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
          })}\n\n`
        ));
        
        controller.close();
      }
    }
  });
}