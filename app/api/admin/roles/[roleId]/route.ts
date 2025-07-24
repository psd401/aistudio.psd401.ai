import { NextRequest, NextResponse } from "next/server"
import { updateRole, deleteRole } from "@/lib/db/data-api-adapter"
import { requireAdmin } from "@/lib/auth/admin-check"
import logger from "@/lib/logger"
import { getErrorMessage } from "@/types/errors"

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ roleId: string }> }
) {
  try {
    // Check admin authorization
    const authError = await requireAdmin();
    if (authError) return authError;
    
    const { roleId } = await params
    const body = await request.json()
    const role = await updateRole(roleId, body)
    
    return NextResponse.json({ role })
  } catch (error) {
    logger.error("Error updating role:", error)
    return NextResponse.json(
      { error: getErrorMessage(error) || "Failed to update role" },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ roleId: string }> }
) {
  try {
    // Check admin authorization
    const authError = await requireAdmin();
    if (authError) return authError;
    
    const { roleId } = await params
    const role = await deleteRole(roleId)
    
    return NextResponse.json({ role })
  } catch (error) {
    logger.error("Error deleting role:", error)
    return NextResponse.json(
      { error: getErrorMessage(error) || "Failed to delete role" },
      { status: 500 }
    )
  }
} 