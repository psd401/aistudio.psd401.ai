"use server"

import { getAuth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db/db"
import { chainPromptsTable, aiModelsTable } from "@/db/schema"
import { eq } from "drizzle-orm"

interface Params {
  params: { id: string }
}

export async function GET(req: NextRequest, { params }: Params) {
  const { userId } = getAuth(req)
  if (!userId) {
    return new NextResponse("Unauthorized", { status: 401 })
  }

  try {
    const promptId = params.id

    // Find the prompt by ID
    const [prompt] = await db
      .select()
      .from(chainPromptsTable)
      .where(eq(chainPromptsTable.id, promptId))

    if (!prompt) {
      return new NextResponse("Prompt not found", { status: 404 })
    }

    let actualModelId: string | null = null;

    // If the prompt has a model ID integer reference, fetch the corresponding AI model's text model_id
    if (prompt.modelId) {
      const [model] = await db
        .select()
        .from(aiModelsTable)
        .where(eq(aiModelsTable.id, prompt.modelId))

      if (model) {
        actualModelId = model.modelId; // Get the text model_id
      }
    }

    // If no model found through the prompt, get the text model_id of the first available model
    if (!actualModelId) {
      const [defaultModel] = await db
        .select()
        .from(aiModelsTable)
        .where(eq(aiModelsTable.active, true))
        .limit(1)
      
      actualModelId = defaultModel?.modelId || null;
    }

    // Return the prompt along with the actual text model_id
    return NextResponse.json({
      ...prompt,
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