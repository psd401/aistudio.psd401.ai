import { NextResponse } from "next/server"
import { getAuth } from "@clerk/nextjs/server"
import { getUserTools } from "@/utils/roles"

export async function GET(request: Request) {
  try {
    const { userId } = getAuth(request)
    if (!userId) {
      return NextResponse.json(
        { isSuccess: false, message: "Unauthorized" },
        { status: 401 }
      )
    }

    // Get user's tools
    const tools = await getUserTools(userId)

    return NextResponse.json({
      isSuccess: true,
      data: tools
    })
  } catch (error) {
    console.error("Error fetching user tools:", error)
    return NextResponse.json(
      { 
        isSuccess: false, 
        message: error instanceof Error ? error.message : "Failed to fetch user tools"
      },
      { status: 500 }
    )
  }
} 