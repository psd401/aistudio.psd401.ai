import { NextRequest, NextResponse } from "next/server"
import { getRoleTools } from "@/lib/db/data-api-adapter"
import { requireAdmin } from "@/lib/auth/admin-check"
import logger from '@/lib/logger';
import { getErrorMessage } from "@/types/errors";

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
  } catch (error) {
    logger.error("Error fetching role tools:", error)
    return NextResponse.json(
      { error: getErrorMessage(error) || "Failed to fetch role tools" },
      { status: 500 }
    )
  }
} 