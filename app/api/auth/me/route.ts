import { NextResponse } from "next/server"
import { getAuth } from "@clerk/nextjs/server"

export async function GET(request: Request) {
  try {
    const { userId } = getAuth(request)
    
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" }, 
        { status: 401 }
      )
    }
    
    return NextResponse.json({ userId })
  } catch (error) {
    console.error("Error in auth/me endpoint:", error)
    return NextResponse.json(
      { error: "Authentication error" },
      { status: 500 }
    )
  }
} 