import { executeSQL } from '@/lib/db/data-api-adapter';
import { createLogger } from '@/lib/logger';
import { ensureRDSNumber, ensureRDSString } from '@/lib/type-helpers';
import type { SqlParameter } from "@aws-sdk/client-rds-data";

const log = createLogger({ module: 'model-config' });

/**
 * Get model configuration from database
 */
export async function getModelConfig(modelId: string | number) {
  log.info('getModelConfig called', { modelId, type: typeof modelId });

  const isNumericId = typeof modelId === 'number' || /^\d+$/.test(String(modelId));

  let query: string;
  let parameters: SqlParameter[];

  if (isNumericId) {
    query = `
      SELECT id, name, provider, model_id
      FROM ai_models
      WHERE id = :modelId AND active = true AND chat_enabled = true
      LIMIT 1
    `;
    parameters = [
      { name: 'modelId', value: { longValue: Number(modelId) } }
    ];
  } else {
    query = `
      SELECT id, name, provider, model_id
      FROM ai_models
      WHERE model_id = :modelId AND active = true AND chat_enabled = true
      LIMIT 1
    `;
    parameters = [
      { name: 'modelId', value: { stringValue: String(modelId) } }
    ];
  }

  const result = await executeSQL<{ id: number; name: string; provider: string; model_id: string }>(query, parameters);

  if (result.length === 0) {
    log.error('Model not found', { modelId });
    return null;
  }

  // The database returns snake_case but RDS Data API adapter converts to camelCase
  // However, 'model_id' might not be converted properly, so access it directly
  const rawResult = result[0] as { id: number; name: string; provider: string; model_id?: string; modelId?: string };

  log.info('Model found in database', {
    rawResult,
    model_id: rawResult.model_id || rawResult.modelId
  });

  return {
    id: ensureRDSNumber(rawResult.id),
    name: ensureRDSString(rawResult.name),
    provider: ensureRDSString(rawResult.provider),
    model_id: ensureRDSString(rawResult.model_id || rawResult.modelId)
  };
}
