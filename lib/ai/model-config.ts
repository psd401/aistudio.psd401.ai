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

  // The RDS Data API adapter converts snake_case to camelCase
  const result = await executeSQL<{ id: number; name: string; provider: string; modelId: string }>(query, parameters);

  if (result.length === 0) {
    log.error('Model not found', { modelId });
    return null;
  }

  const rawResult = result[0];

  log.info('Model found in database', {
    id: rawResult.id,
    name: rawResult.name,
    provider: rawResult.provider,
    modelId: rawResult.modelId
  });

  return {
    id: ensureRDSNumber(rawResult.id),
    name: ensureRDSString(rawResult.name),
    provider: ensureRDSString(rawResult.provider),
    model_id: ensureRDSString(rawResult.modelId)
  };
}
