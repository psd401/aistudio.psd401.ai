import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { hasToolAccess, getUserRoles } from "@/utils/roles"
import { db } from "@/db/db"
import { usersTable } from "@/db/schema"
import { eq } from "drizzle-orm"

export async function GET() {
  try {
    const authResult = auth()
    const { userId } = authResult

    // Skip DB checks if no userId
    if (!userId) {
      return NextResponse.json({
        auth: {
          userId,
          isAuthenticated: !!userId,
          sessionId: authResult.sessionId,
          session: authResult.session
        },
        message: "User not authenticated"
      })
    }

    // Check if user exists in our database
    const dbUser = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.clerkId, userId))
      .then(users => users[0] || null)

    // Get user roles
    const roles = await getUserRoles(userId)

    // Check access to assistant-architect tool
    const hasAccess = await hasToolAccess(userId, "assistant-architect")

    return NextResponse.json({
      auth: {
        userId,
        isAuthenticated: !!userId,
        sessionId: authResult.sessionId,
        session: authResult.session
      },
      user: {
        exists: !!dbUser,
        dbUserId: dbUser?.id,
        roles,
        toolAccess: {
          "assistant-architect": hasAccess
        }
      }
    })
  } catch (error) {
    console.error("Debug auth route error:", error)
    return NextResponse.json(
      { 
        error: "Debug route error", 
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
} 