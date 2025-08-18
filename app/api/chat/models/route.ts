import { withErrorHandling, unauthorized } from '@/lib/api-utils';
import { getServerSession } from '@/lib/auth/server-session';
import { executeSQL } from '@/lib/db/data-api-adapter';
import { createLogger, generateRequestId, startTimer } from '@/lib/logger';
import { transformSnakeToCamel } from '@/lib/db/field-mapper';
import type { SelectAiModel } from '@/types/db-types';

export async function GET() {
  const requestId = generateRequestId();
  const timer = startTimer("api.chat.models");
  const log = createLogger({ requestId, route: "api.chat.models" });
  
  log.info("GET /api/chat/models - Fetching chat models");
  
  const session = await getServerSession();
  if (!session) {
    log.warn("Unauthorized access attempt to chat models");
    timer({ status: "error", reason: "unauthorized" });
    return unauthorized('User not authenticated');
  }
  
  log.debug("User authenticated", { userId: session.sub });

  return withErrorHandling(async () => {
    const query = `
      SELECT id, name, provider, model_id, description, capabilities,
             max_tokens, active, chat_enabled, allowed_roles, created_at, updated_at
      FROM ai_models
      WHERE active = :active AND chat_enabled = :chatEnabled
      ORDER BY provider ASC, name ASC
    `;
    const parameters = [
      { name: 'active', value: { booleanValue: true } },
      { name: 'chatEnabled', value: { booleanValue: true } }
    ];
    
    const models = await executeSQL(query, parameters);
    
    // Transform snake_case to camelCase for frontend compatibility
    const transformedModels = models.map(model => 
      transformSnakeToCamel<SelectAiModel>(model)
    );
    
    log.info("Chat models retrieved successfully", { count: transformedModels.length });
    timer({ status: "success", count: transformedModels.length });
    
    return transformedModels;
  });
} 