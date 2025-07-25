import { NextRequest, NextResponse } from "next/server"
import { createRole, executeSQL } from "@/lib/db/data-api-adapter"
import { requireAdmin } from "@/lib/auth/admin-check"
import logger from "@/lib/logger"

export async function GET() {
  try {
    // Check admin authorization
    const authError = await requireAdmin();
    if (authError) return authError;

    // Get all roles
    const result = await executeSQL('SELECT id, name FROM roles ORDER BY name')

    const roles = result.map((record) => ({
      id: String(record.id),
      name: String(record.name),
    }))

    return NextResponse.json({
      isSuccess: true,
      data: roles
    })
  } catch (error) {
    return NextResponse.json(
      { 
        isSuccess: false, 
        message: error instanceof Error ? error.message : "Failed to fetch roles"
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check admin authorization
    const authError = await requireAdmin();
    if (authError) return authError;
    
    const body = await request.json()
    const role = await createRole(body)
    
    return NextResponse.json({ role })
  } catch (error) {
    logger.error("Error creating role:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create role" },
      { status: 500 }
    )
  }
} 