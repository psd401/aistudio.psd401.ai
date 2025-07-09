import { NextRequest, NextResponse } from "next/server"
import { getRoleTools } from "@/lib/db/data-api-adapter"
import { requireAdmin } from "@/lib/auth/admin-check"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ roleId: string }> }
) {
  try {
    // Check admin authorization
    const authError = await requireAdmin();
    if (authError) return authError;
    
    const { roleId } = await params
    const tools = await getRoleTools(parseInt(roleId, 10))
    
    return NextResponse.json({ tools })
  } catch (error: any) {
    console.error("Error fetching role tools:", error)
    return NextResponse.json(
      { error: error.message || "Failed to fetch role tools" },
      { status: 500 }
    )
  }
} 