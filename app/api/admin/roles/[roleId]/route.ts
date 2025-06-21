import { NextRequest, NextResponse } from "next/server"
import { updateRole, deleteRole } from "@/lib/db/data-api-adapter"
import { requireRole } from "@/lib/auth/role-helpers"

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ roleId: string }> }
) {
  try {
    await requireRole("administrator")
    
    const { roleId } = await params
    const body = await request.json()
    const role = await updateRole(roleId, body)
    
    return NextResponse.json({ role })
  } catch (error: any) {
    console.error("Error updating role:", error)
    return NextResponse.json(
      { error: error.message || "Failed to update role" },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ roleId: string }> }
) {
  try {
    await requireRole("administrator")
    
    const { roleId } = await params
    const role = await deleteRole(roleId)
    
    return NextResponse.json({ role })
  } catch (error: any) {
    console.error("Error deleting role:", error)
    return NextResponse.json(
      { error: error.message || "Failed to delete role" },
      { status: 500 }
    )
  }
} 