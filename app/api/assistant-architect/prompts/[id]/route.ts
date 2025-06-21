import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth/server-session"
import { executeSQL } from "@/lib/db/data-api-adapter"

interface Params {
  params: { id: string }
}

export async function GET(req: NextRequest, context: Params) {
  // Check authentication
  const session = await getServerSession()
  if (!session || !session.sub) {
    return new NextResponse("Unauthorized", { status: 401 })
  }

  try {
    // Await context.params for Next.js dynamic API routes
    const resolvedParams = await Promise.resolve(context.params)
    const promptId = resolvedParams.id

    // Find the prompt by ID
    const promptSql = `
      SELECT id, tool_id, name, content, system_context, model_id, position, input_mapping, created_at, updated_at
      FROM chain_prompts
      WHERE id = :promptId
    `
    const promptResult = await executeSQL(promptSql, [
      { name: 'promptId', value: { stringValue: promptId } }
    ])

    if (!promptResult || promptResult.length === 0) {
      return new NextResponse("Prompt not found", { status: 404 })
    }

    const prompt = promptResult[0]
    let actualModelId: string | null = null;

    // If the prompt has a model ID integer reference, fetch the corresponding AI model's text model_id
    if (prompt.model_id) {
      const modelSql = `
        SELECT id, model_id
        FROM ai_models
        WHERE id = :modelId
      `
      const modelResult = await executeSQL(modelSql, [
        { name: 'modelId', value: { longValue: prompt.model_id } }
      ])

      if (modelResult && modelResult.length > 0) {
        actualModelId = modelResult[0].model_id; // Get the text model_id
      }
    }

    // If no model found through the prompt, get the text model_id of the first available model
    if (!actualModelId) {
      const defaultModelSql = `
        SELECT model_id
        FROM ai_models
        WHERE active = true
        LIMIT 1
      `
      const defaultModelResult = await executeSQL(defaultModelSql)
      
      actualModelId = defaultModelResult?.[0]?.model_id || null;
    }

    // Transform snake_case to camelCase and return the prompt along with the actual text model_id
    return NextResponse.json({
      id: prompt.id,
      toolId: prompt.tool_id,
      name: prompt.name,
      content: prompt.content,
      systemContext: prompt.system_context,
      modelId: prompt.model_id,
      position: prompt.position,
      inputMapping: prompt.input_mapping,
      createdAt: prompt.created_at,
      updatedAt: prompt.updated_at,
      actualModelId: actualModelId // Send the text model_id
    })
  } catch (error) {
    console.error("Error fetching prompt:", error)
    return new NextResponse(
      JSON.stringify({ error: "Failed to fetch prompt" }),
      { status: 500 }
    )
  }
} 