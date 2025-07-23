import { NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth/server-session"
import { getUserRolesByCognitoSub } from "@/lib/db/data-api-adapter"
import logger from '@/lib/logger';

export async function GET() {
  try {
    const session = await getServerSession()
    if (!session) {
      return NextResponse.json(
        { isSuccess: false, message: "Unauthorized" },
        { status: 401 }
      )
    }

    // Get user roles
    const groups = await getUserRolesByCognitoSub(session.sub)

    return NextResponse.json({ isSuccess: true, groups })
  } catch (error) {
    logger.error("Error fetching user groups:", error)
    return NextResponse.json(
      { 
        isSuccess: false, 
        message: error instanceof Error ? error.message : "Failed to fetch user groups"
      },
      { status: 500 }
    )
  }
} 