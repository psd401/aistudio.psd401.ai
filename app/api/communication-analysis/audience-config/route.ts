import { NextResponse } from "next/server"
import { db } from "@/db/db"
import { audienceConfigsTable, audiencesTable, aiModelsTable } from "@/db/schema"
import { getAuth } from "@clerk/nextjs/server"
import { hasRole } from "@/utils/roles"
import { eq } from "drizzle-orm"
import type { InsertAudienceConfig } from "@/types"

export async function GET() {
  try {
    const configs = await db
      .select({
        id: audienceConfigsTable.id,
        audienceId: audienceConfigsTable.audienceId,
        modelId: audienceConfigsTable.modelId,
        audience: audiencesTable,
        model: aiModelsTable,
        createdAt: audienceConfigsTable.createdAt,
        updatedAt: audienceConfigsTable.updatedAt
      })
      .from(audienceConfigsTable)
      .leftJoin(audiencesTable, eq(audienceConfigsTable.audienceId, audiencesTable.id))
      .leftJoin(aiModelsTable, eq(audienceConfigsTable.modelId, aiModelsTable.id))

    return NextResponse.json({
      isSuccess: true,
      message: "Audience configurations retrieved successfully",
      data: configs
    })
  } catch (error) {
    console.error("Error fetching audience configurations:", error)
    return NextResponse.json(
      { isSuccess: false, message: "Failed to fetch audience configurations" },
      { status: 500 }
    )
  }
}

export async function PUT(request: Request) {
  try {
    const { userId } = getAuth(request)
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const isStaff = await hasRole(userId, "staff")
    if (!isStaff) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const body = await request.json()
    const { audienceId, modelId } = body

    if (!audienceId || !modelId) {
      return NextResponse.json(
        { isSuccess: false, message: "Missing required fields" },
        { status: 400 }
      )
    }

    // Handle meta analysis separately
    if (audienceId === "meta") {
      return NextResponse.json(
        { isSuccess: false, message: "Meta analysis should be configured through /api/communication-analysis/prompts" },
        { status: 400 }
      )
    }

    // Verify the audience exists
    const [audience] = await db
      .select()
      .from(audiencesTable)
      .where(eq(audiencesTable.id, audienceId))

    if (!audience) {
      return NextResponse.json(
        { isSuccess: false, message: "Audience not found" },
        { status: 404 }
      )
    }

    // Verify the model exists
    const [model] = await db
      .select()
      .from(aiModelsTable)
      .where(eq(aiModelsTable.id, parseInt(modelId)))

    if (!model) {
      return NextResponse.json(
        { isSuccess: false, message: "Model not found" },
        { status: 404 }
      )
    }

    // Update or create the config
    const [existingConfig] = await db
      .select()
      .from(audienceConfigsTable)
      .where(eq(audienceConfigsTable.audienceId, audienceId))

    let config
    if (existingConfig) {
      [config] = await db
        .update(audienceConfigsTable)
        .set({ modelId: parseInt(modelId), updatedAt: new Date() })
        .where(eq(audienceConfigsTable.id, existingConfig.id))
        .returning()
    } else {
      const configData = {
        audienceId,
        modelId: parseInt(modelId)
      } as const

      [config] = await db
        .insert(audienceConfigsTable)
        .values(configData)
        .returning()
    }

    // Get the full config with related data
    const [fullConfig] = await db
      .select({
        id: audienceConfigsTable.id,
        audienceId: audienceConfigsTable.audienceId,
        modelId: audienceConfigsTable.modelId,
        audience: audiencesTable,
        model: aiModelsTable,
        createdAt: audienceConfigsTable.createdAt,
        updatedAt: audienceConfigsTable.updatedAt
      })
      .from(audienceConfigsTable)
      .where(eq(audienceConfigsTable.id, config.id))
      .leftJoin(audiencesTable, eq(audienceConfigsTable.audienceId, audiencesTable.id))
      .leftJoin(aiModelsTable, eq(audienceConfigsTable.modelId, aiModelsTable.id))

    return NextResponse.json({
      isSuccess: true,
      message: "Audience configuration updated successfully",
      data: fullConfig
    })
  } catch (error) {
    console.error("Error updating audience configuration:", error)
    return NextResponse.json(
      { isSuccess: false, message: "Failed to update audience configuration" },
      { status: 500 }
    )
  }
} 