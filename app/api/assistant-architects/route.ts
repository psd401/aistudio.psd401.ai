import { NextResponse } from "next/server"
import { getAuth } from "@clerk/nextjs/server"
import { getAssistantArchitectsAction } from "@/actions/db/assistant-architect-actions"
import { hasToolAccess } from "@/utils/roles"

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { userId } = getAuth(request)
    if (!userId) {
      return NextResponse.json(
        { isSuccess: false, message: "Unauthorized" },
        { status: 401 }
      )
    }

    // Check if user has access to the assistant-architect tool
    const hasAccess = await hasToolAccess(userId, "assistant-architect")
    if (!hasAccess) {
      return NextResponse.json(
        { isSuccess: false, message: "Forbidden" },
        { status: 403 }
      )
    }
    
    const result = await getAssistantArchitectsAction()
    
    if (!result.isSuccess) {
      return NextResponse.json(result, { status: 400 })
    }

    return NextResponse.json({
      tools: result.data
    })
  } catch (error) {
    console.error("Error in assistant-architects API:", error)
    return NextResponse.json(
      { 
        isSuccess: false, 
        message: "Failed to fetch Assistant Architects"
      },
      { status: 500 }
    )
  }
} 