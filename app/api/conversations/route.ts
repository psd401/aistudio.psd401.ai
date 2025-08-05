import { withErrorHandling, unauthorized } from '@/lib/api-utils';
import { getServerSession } from '@/lib/auth/server-session';
import { getCurrentUserAction } from '@/actions/db/get-current-user-action';
import { executeSQL } from '@/lib/db/data-api-adapter';
import { createLogger, generateRequestId, startTimer } from '@/lib/logger';

export async function GET() {
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
    const query = `
      SELECT id, user_id, title, created_at, updated_at, 
             model_id, source, execution_id, context
      FROM conversations
      WHERE user_id = :userId
        AND source = :source
      ORDER BY updated_at DESC
    `;
    
    const parameters = [
      { name: 'userId', value: { longValue: userId } },
      { name: 'source', value: { stringValue: 'chat' } }
    ];
    
    const userConversations = await executeSQL(query, parameters);
    
    log.info("Conversations retrieved successfully", { count: userConversations.length });
    timer({ status: "success", count: userConversations.length });
    
    return userConversations;
  });
} 