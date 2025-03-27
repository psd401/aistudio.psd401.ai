"use server"

import { db } from "@/db/query"
import { aiModelsTable } from "@/db/schema"
import { ActionState, SelectAiModel } from "@/types"
import { asc } from "drizzle-orm"

export async function getAiModelsAction(): Promise<ActionState<SelectAiModel[]>> {
  try {
    const models = await db
      .select()
      .from(aiModelsTable)
      .orderBy(asc(aiModelsTable.name))

    return {
      isSuccess: true,
      message: "Models retrieved successfully",
      data: models
    }
  } catch (error) {
    console.error("Error getting models:", error)
    return { isSuccess: false, message: "Failed to get models" }
  }
} 