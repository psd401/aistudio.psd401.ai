import { NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth/server-session"
import { getUserRolesByCognitoSub } from "@/lib/db/data-api-adapter"

export async function GET(request: Request) {
  try {
    const session = await getServerSession()
    if (!session) {
      return NextResponse.json(
        { isSuccess: false, message: "Unauthorized" },
        { status: 401 }
      )
    }

    // Get user roles (formerly called groups in Clerk)
    const groups = await getUserRolesByCognitoSub(session.sub)

    return NextResponse.json({ isSuccess: true, groups })
  } catch (error) {
    console.error("Error fetching user groups:", error)
    return NextResponse.json(
      { 
        isSuccess: false, 
        message: error instanceof Error ? error.message : "Failed to fetch user groups"
      },
      { status: 500 }
    )
  }
} 