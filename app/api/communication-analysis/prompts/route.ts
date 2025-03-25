import { NextResponse } from "next/server"
import { getPromptsAction, upsertPromptAction } from "@/actions/db/communication-analysis-actions"
import { getAuth } from "@clerk/nextjs/server"
import { hasRole } from "@/utils/roles"

export async function PUT(request: Request) {
  try {
    const { userId } = getAuth(request)
    if (!userId) {
      return NextResponse.json(
        { isSuccess: false, message: "Unauthorized" },
        { status: 401 }
      )
    }

    const [isStaff, isAdmin] = await Promise.all([
      hasRole(userId, "staff"),
      hasRole(userId, "administrator")
    ])
    if (!isStaff && !isAdmin) {
      return NextResponse.json(
        { isSuccess: false, message: "Forbidden" },
        { status: 403 }
      )
    }

    const body = await request.json()
    const result = await upsertPromptAction(body)
    
    if (!result.isSuccess) {
      return NextResponse.json(result, { status: 400 })
    }

    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { isSuccess: false, message: "Failed to update prompt" },
      { status: 500 }
    )
  }
}

export async function GET(request: Request) {
  try {
    const { userId } = getAuth(request)
    if (!userId) {
      return NextResponse.json(
        { isSuccess: false, message: "Unauthorized" },
        { status: 401 }
      )
    }

    const [isStaff, isAdmin] = await Promise.all([
      hasRole(userId, "staff"),
      hasRole(userId, "administrator")
    ])
    if (!isStaff && !isAdmin) {
      return NextResponse.json(
        { isSuccess: false, message: "Forbidden" },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const isMetaAnalysis = searchParams.get("isMetaAnalysis") === "true"
    const audienceId = searchParams.get("audienceId")

    const result = await getPromptsAction({ isMetaAnalysis, audienceId })
    
    if (!result.isSuccess) {
      return NextResponse.json(result, { status: 400 })
    }

    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { isSuccess: false, message: "Failed to fetch prompts" },
      { status: 500 }
    )
  }
} 