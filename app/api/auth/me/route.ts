import { NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth/server-session"

export async function GET(request: Request) {
  try {
    const session = await getServerSession()
    
    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized" }, 
        { status: 401 }
      )
    }
    
    return NextResponse.json({ 
      userId: session.sub,
      email: session.email 
    })
  } catch (error) {
    console.error("Error in auth/me endpoint:", error)
    return NextResponse.json(
      { error: "Authentication error" },
      { status: 500 }
    )
  }
} 