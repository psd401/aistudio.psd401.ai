import { NextResponse } from "next/server"
import { getAuth } from "@clerk/nextjs/server"
import { db } from "@/db/db"
import { usersTable } from "@/db/schema"
import { eq } from "drizzle-orm"
import { getUserRoles, getHighestUserRole } from "@/utils/roles"

export async function GET(request: Request) {
  try {
    const { userId } = getAuth(request)
    if (!userId) {
      return NextResponse.json(
        { isSuccess: false, message: "Unauthorized" },
        { status: 401 }
      )
    }

    // Get user's roles
    const roles = await getUserRoles(userId)
    
    // Get the user's highest role for backward compatibility
    const highestRole = await getHighestUserRole(userId)

    if (!roles.length) {
      return NextResponse.json(
        { isSuccess: false, message: "User has no roles" },
        { status: 404 }
      )
    }

    return NextResponse.json({
      isSuccess: true,
      // For backward compatibility with existing code
      role: highestRole,
      // New field with all roles
      roles: roles
    })
  } catch (error) {
    console.error("Error checking role:", error)
    return NextResponse.json(
      { 
        isSuccess: false, 
        message: error instanceof Error ? error.message : "Failed to check role"
      },
      { status: 500 }
    )
  }
} 