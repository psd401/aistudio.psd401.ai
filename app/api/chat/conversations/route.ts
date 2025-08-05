import { getCurrentUserAction } from "@/actions/db/get-current-user-action"
import { executeSQL } from "@/lib/db/data-api-adapter"
import { createLogger, generateRequestId, startTimer } from '@/lib/logger';

export async function GET() {
  const requestId = generateRequestId();
  const timer = startTimer("api.chat.conversations.list");
  const log = createLogger({ requestId, route: "api.chat.conversations" });
  
  log.info("GET /api/chat/conversations - Fetching user conversations");
  
  const currentUser = await getCurrentUserAction()
  if (!currentUser.isSuccess) {
    log.warn("Unauthorized access attempt to conversations");
    timer({ status: "error", reason: "unauthorized" });
    return new Response("Unauthorized", { status: 401 })
  }
  
  log.debug("User authenticated", { userId: currentUser.data.user.id });

  try {
    const query = `
      SELECT id, user_id, title, created_at, updated_at,
             model_id, source, execution_id, context
      FROM conversations
      WHERE user_id = :userId
      ORDER BY created_at DESC
    `;
    const parameters = [
      { name: 'userId', value: { longValue: currentUser.data.user.id } }
    ];
    
    const conversations = await executeSQL(query, parameters);

    log.info("Conversations retrieved successfully", { count: conversations.length });
    timer({ status: "success", count: conversations.length });

    return new Response(JSON.stringify(conversations), {
      headers: { 
        "Content-Type": "application/json",
        "X-Request-Id": requestId
      },
    })
  } catch (error) {
    timer({ status: "error" });
    log.error("Error fetching conversations:", error)
    return new Response("Internal Server Error", { status: 500 })
  }
}

export async function POST(req: Request) {
  const requestId = generateRequestId();
  const timer = startTimer("api.chat.conversations.create");
  const log = createLogger({ requestId, route: "api.chat.conversations" });
  
  log.info("POST /api/chat/conversations - Creating new conversation");
  
  const currentUser = await getCurrentUserAction()
  if (!currentUser.isSuccess) {
    log.warn("Unauthorized conversation creation attempt");
    timer({ status: "error", reason: "unauthorized" });
    return new Response("Unauthorized", { status: 401 })
  }
  
  log.debug("User authenticated", { userId: currentUser.data.user.id });

  const body = await req.json()
  
  log.debug("Creating conversation", { 
    title: body.title, 
    source: body.source,
    hasExecutionId: !!body.executionId 
  });

  try {
    const insertQuery = `
      INSERT INTO conversations (title, user_id, model_id, source, execution_id, context)
      VALUES (:title, :userId, :modelId, :source, :executionId, :context)
      RETURNING id, user_id, title, created_at, updated_at, model_id, source, execution_id, context
    `;
    const insertParams = [
      { name: 'title', value: { stringValue: body.title || 'New Conversation' } },
      { name: 'userId', value: { longValue: currentUser.data.user.id } },
      { name: 'modelId', value: body.modelId ? { longValue: body.modelId } : { isNull: true } },
      { name: 'source', value: { stringValue: body.source || 'chat' } },
      { name: 'executionId', value: body.executionId ? { stringValue: body.executionId } : { isNull: true } },
      { name: 'context', value: body.context ? { stringValue: JSON.stringify(body.context) } : { isNull: true } }
    ];
    
    const result = await executeSQL(insertQuery, insertParams);
    const conversation = result[0];

    log.info("Conversation created successfully", { conversationId: conversation.id });
    timer({ status: "success", conversationId: conversation.id });

    return new Response(JSON.stringify(conversation), {
      status: 201,
      headers: { 
        "Content-Type": "application/json",
        "X-Request-Id": requestId
      },
    })
  } catch (error) {
    timer({ status: "error" });
    log.error("Error creating conversation:", error)
    return new Response("Internal Server Error", { status: 500 })
  }
} 