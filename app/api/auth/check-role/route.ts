import { NextResponse } from "next/server"
import { getAuth } from "@clerk/nextjs/server"
import { db } from "@/db/db"
import { usersTable } from "@/db/schema"
import { eq } from "drizzle-orm"

export async function GET(request: Request) {
  try {
    const { userId } = getAuth(request)
    if (!userId) {
      return NextResponse.json(
        { isSuccess: false, message: "Unauthorized" },
        { status: 401 }
      )
    }

    // Get user from database
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.clerkId, userId))

    if (!user) {
      return NextResponse.json(
        { isSuccess: false, message: "User not found" },
        { status: 404 }
      )
    }

    return NextResponse.json({
      isSuccess: true,
      role: user.role
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