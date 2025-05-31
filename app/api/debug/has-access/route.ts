import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { hasToolAccess } from "@/utils/roles"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const toolId = searchParams.get("tool") || "assistant-architect"
    
    const { userId } = auth()
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    // Use the hasToolAccess utility directly
    const hasAccess = await hasToolAccess(userId, toolId)

    return NextResponse.json({
      userId,
      toolId,
      hasAccess
    })
  } catch (error) {
    return NextResponse.json({ 
      error: "Error checking tool access",
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
} 