import { withErrorHandling, unauthorized } from '@/lib/api-utils';
import { getServerSession } from '@/lib/auth/server-session';
import { getCurrentUserAction } from '@/actions/db/get-current-user-action';
import { executeSQL } from '@/lib/db/data-api-adapter';

export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return unauthorized('User not authenticated');
  }
  
  const currentUser = await getCurrentUserAction();
  if (!currentUser.isSuccess) {
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
    return userConversations;
  });
} 