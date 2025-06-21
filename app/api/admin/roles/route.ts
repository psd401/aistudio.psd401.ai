import { NextRequest, NextResponse } from "next/server"
import { createRole } from "@/lib/db/data-api-adapter"
import { requireRole } from "@/lib/auth/role-helpers"

export async function POST(request: NextRequest) {
  try {
    await requireRole("administrator")
    
    const body = await request.json()
    const role = await createRole(body)
    
    return NextResponse.json({ role })
  } catch (error: any) {
    console.error("Error creating role:", error)
    return NextResponse.json(
      { error: error.message || "Failed to create role" },
      { status: 500 }
    )
  }
} 