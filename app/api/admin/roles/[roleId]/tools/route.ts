import { NextRequest, NextResponse } from "next/server"
import { getRoleTools } from "@/lib/db/data-api-adapter"
import { requireRole } from "@/lib/auth/role-helpers"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ roleId: string }> }
) {
  try {
    await requireRole("administrator")
    
    const { roleId } = await params
    const tools = await getRoleTools(roleId)
    
    return NextResponse.json({ tools })
  } catch (error: any) {
    console.error("Error fetching role tools:", error)
    return NextResponse.json(
      { error: error.message || "Failed to fetch role tools" },
      { status: 500 }
    )
  }
} 