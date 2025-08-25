import { withErrorHandling, unauthorized } from '@/lib/api-utils';
import { getServerSession } from '@/lib/auth/server-session';
import { getCurrentUserAction } from '@/actions/db/get-current-user-action';
import { executeSQL } from '@/lib/db/data-api-adapter';
import { createLogger, generateRequestId, startTimer } from '@/lib/logger';

export async function GET(request: Request) {
  const requestId = generateRequestId();
  const timer = startTimer("api.conversations");
  const log = createLogger({ requestId, route: "api.conversations" });
  
  log.info("GET /api/conversations - Fetching user conversations");
  
  const session = await getServerSession();
  if (!session) {
    log.warn("Unauthorized access attempt to conversations");
    timer({ status: "error", reason: "unauthorized" });
    return unauthorized('User not authenticated');
  }
  
  log.debug("User authenticated", { userId: session.sub });
  
  const currentUser = await getCurrentUserAction();
  if (!currentUser.isSuccess) {
    log.warn("User not found");
    timer({ status: "error", reason: "user_not_found" });
    return unauthorized('User not found');
  }
  
  const userId = currentUser.data.user.id;

  return withErrorHandling(async () => {
    // Parse URL parameters
    const url = new URL(request.url);
    const latest = url.searchParams.get('latest') === 'true';
    const limit = latest ? 1 : undefined;
    
    let query = `
      SELECT c.id, c.user_id, c.title, c.created_at, c.updated_at,
             c.model_id, c.source, c.execution_id, c.context,
             am.name as model_name, am.provider as model_provider,
             am.model_id as model_identifier, am.description as model_description
      FROM conversations c
      LEFT JOIN ai_models am ON c.model_id = am.id
      WHERE c.user_id = :userId
        AND c.source = :source
      ORDER BY c.updated_at DESC
    `;
    
    if (limit) {
      query += ` LIMIT ${limit}`;
    }
    
    const parameters = [
      { name: 'userId', value: { longValue: userId } },
      { name: 'source', value: { stringValue: 'chat' } }
    ];
    
    const userConversations = await executeSQL(query, parameters);
    
    log.info("Conversations retrieved successfully", { 
      count: userConversations.length,
      latest,
      limit 
    });
    timer({ status: "success", count: userConversations.length });
    
    return userConversations;
  });
} 