import { NextResponse } from "next/server"
import { getAuth, clerkClient } from "@clerk/nextjs/server"

export async function GET(request: Request) {
  try {
    const { userId } = getAuth(request)
    if (!userId) {
      return NextResponse.json(
        { isSuccess: false, message: "Unauthorized" },
        { status: 401 }
      )
    }

    const user = await clerkClient.users.getUser(userId)
    const groups = user.privateMetadata.groups as string[] || []

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