import { NextRequest } from 'next/server';
import { withErrorHandling, unauthorized } from '@/lib/api-utils';
import { getServerSession } from '@/lib/auth/server-session';
import { executeSQL } from '@/lib/db/data-api-adapter';

export async function GET(req: NextRequest) {
  const session = await getServerSession();
  
  if (!session) {
    return unauthorized('User not authenticated');
  }

  return withErrorHandling(async () => {
    const query = `
      SELECT id, name, provider, model_id, description, capabilities, 
             max_tokens, active, chat_enabled, created_at, updated_at
      FROM ai_models 
      WHERE provider = :provider 
        AND active = :active 
        AND chat_enabled = :chatEnabled
      ORDER BY name ASC
    `;
    
    const parameters = [
      { name: 'provider', value: { stringValue: 'amazon-bedrock' } },
      { name: 'active', value: { booleanValue: true } },
      { name: 'chatEnabled', value: { booleanValue: true } }
    ];
    
    const models = await executeSQL(query, parameters);
    
    return models;
  });
}