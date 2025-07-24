import { NextResponse } from "next/server"
import { getAssistantArchitectsAction } from "@/actions/db/assistant-architect-actions"
import { getServerSession } from "@/lib/auth/server-session"
import { hasToolAccess } from "@/lib/db/data-api-adapter"
import logger from '@/lib/logger';

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getServerSession()
    if (!session || !session.sub) {
      return NextResponse.json(
        { isSuccess: false, message: "Unauthorized" },
        { status: 401 }
      )
    }

    // Check if user has access to the assistant-architect tool
    const hasAccess = await hasToolAccess(session.sub, "assistant-architect")
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
    logger.error("Error in assistant-architects API:", error)
    return NextResponse.json(
      { 
        isSuccess: false, 
        message: "Failed to fetch Assistant Architects"
      },
      { status: 500 }
    )
  }
} 