import { NextResponse } from "next/server"
import { getAuth } from "@clerk/nextjs/server"
import { db } from "@/db/db"
import { analysisPromptsTable, aiModelsTable, audiencesTable } from "@/db/schema"
import { eq, and } from "drizzle-orm"
import { generateCompletion } from "@/lib/ai-helpers"

export async function POST(request: Request) {
  try {
    const { userId } = getAuth(request)
    if (!userId) {
      return NextResponse.json(
        { isSuccess: false, message: "Unauthorized" },
        { status: 401 }
      )
    }

    const { prompt: message, ...body } = await request.json()
    const { audienceId, isMetaAnalysis, previousResults } = body

    if (!message) {
      return NextResponse.json(
        { isSuccess: false, message: "Message is required" },
        { status: 400 }
      )
    }

    // Get the prompt, model configuration, and audience information
    const [config] = await db
      .select({
        prompt: analysisPromptsTable.prompt,
        model: aiModelsTable,
        audience: audiencesTable
      })
      .from(analysisPromptsTable)
      .leftJoin(aiModelsTable, eq(analysisPromptsTable.modelId, aiModelsTable.id))
      .leftJoin(audiencesTable, eq(analysisPromptsTable.audienceId, audiencesTable.id))
      .where(
        isMetaAnalysis
          ? eq(analysisPromptsTable.isMetaAnalysis, true)
          : and(
              eq(analysisPromptsTable.audienceId, audienceId),
              eq(analysisPromptsTable.isMetaAnalysis, false)
            )
      )

    if (!config?.prompt || !config?.model) {
      return NextResponse.json(
        { isSuccess: false, message: "Audience not properly configured" },
        { status: 400 }
      )
    }

    // For regular analysis, include the audience persona in the system prompt
    let systemPrompt = config.prompt
    if (!isMetaAnalysis && config.audience?.description) {
      systemPrompt = `${config.prompt}\n\nAudience Persona:\n${config.audience.description}`
    }
    
    // For meta analysis, include the previous results and their audience personas
    if (isMetaAnalysis && previousResults) {
      const resultsContext = previousResults
        .map(({ name, result }) => `Analysis for ${name}:\n${result}\n---\n`)
        .join("\n")
      
      systemPrompt = `${config.prompt}\n\nPrevious analyses:\n${resultsContext}`
    }

    const completion = await generateCompletion(
      {
        provider: config.model.provider,
        modelId: config.model.modelId
      },
      systemPrompt,
      message
    )

    return NextResponse.json({
      isSuccess: true,
      message: "Analysis completed",
      data: completion
    })

  } catch (error) {
    console.error("Error analyzing message:", error)
    return NextResponse.json(
      { 
        isSuccess: false, 
        message: error instanceof Error ? error.message : "Failed to analyze message"
      },
      { status: 500 }
    )
  }
} 