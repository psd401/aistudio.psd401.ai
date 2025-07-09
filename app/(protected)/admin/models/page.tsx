import { Suspense } from "react"
import { AiModelsClient } from "@/components/features/ai-models-client"
import { requireRole } from "@/lib/auth/role-helpers"
import { getAIModels } from "@/lib/db/data-api-adapter"

export default async function ModelsPage() {
  await requireRole("administrator");
  
  // Fetch AI models from the database
  const rawModels = await getAIModels();
  
  // Transform snake_case to camelCase
  const models = rawModels.map((model: any) => ({
    id: model.id,
    name: model.name,
    provider: model.provider,
    modelId: model.model_id,
    description: model.description,
    capabilities: model.capabilities,
    maxTokens: model.max_tokens,
    active: model.active,
    chatEnabled: model.chat_enabled,
    createdAt: model.created_at,
    updatedAt: model.updated_at
  }));
  
  return (
    <div className="p-6">
      <h1 className="mb-6 text-2xl font-bold">AI Models Management</h1>
      <Suspense fallback={<div>Loading models...</div>}>
        <AiModelsClient initialModels={models || []} />
      </Suspense>
    </div>
  )
} 