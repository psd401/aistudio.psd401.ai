"use server"

import { NextResponse } from "next/server"
import { getAuth } from "@clerk/nextjs/server"
import { hasToolAccess } from "@/utils/roles"

export async function GET(request: Request) {
  try {
    // Get userId from auth
    const { userId } = getAuth(request)
    
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized", hasAccess: false },
        { status: 401 }
      )
    }
    
    // Get the tool identifier from the query string
    const { searchParams } = new URL(request.url)
    const toolId = searchParams.get("toolId")
    
    if (!toolId) {
      return NextResponse.json(
        { error: "Missing tool identifier", hasAccess: false },
        { status: 400 }
      )
    }
    
    // Check if the user has access to the tool
    const hasAccess = await hasToolAccess(userId, toolId)
    
    return NextResponse.json({ userId, toolId, hasAccess })
  } catch (error) {
    console.error("Error checking tool access:", error)
    return NextResponse.json(
      { error: "Failed to check tool access", hasAccess: false },
      { status: 500 }
    )
  }
} 