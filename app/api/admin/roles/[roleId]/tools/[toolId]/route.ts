import { NextRequest, NextResponse } from "next/server"
import { assignToolToRole, removeToolFromRole } from "@/lib/db/data-api-adapter"
import { requireRole } from "@/lib/auth/role-helpers"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ roleId: string; toolId: string }> }
) {
  try {
    await requireRole("administrator")
    
    const { roleId, toolId } = await params
    const success = await assignToolToRole(roleId, toolId)
    
    return NextResponse.json({ success })
  } catch (error: any) {
    console.error("Error assigning tool to role:", error)
    return NextResponse.json(
      { error: error.message || "Failed to assign tool" },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ roleId: string; toolId: string }> }
) {
  try {
    await requireRole("administrator")
    
    const { roleId, toolId } = await params
    const success = await removeToolFromRole(roleId, toolId)
    
    return NextResponse.json({ success })
  } catch (error: any) {
    console.error("Error removing tool from role:", error)
    return NextResponse.json(
      { error: error.message || "Failed to remove tool" },
      { status: 500 }
    )
  }
} 