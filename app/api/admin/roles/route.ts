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
    const result = await executeSQL({
      sql: 'SELECT name FROM roles ORDER BY name',
      database: 'aistudio',
      secretArn: process.env.DB_SECRET_ARN!,
      resourceArn: process.env.DB_RESOURCE_ARN!,
    })

    const roles = result.records?.map(record => ({
      id: record[0].stringValue!,
      name: record[0].stringValue!,
    })) || []

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
  } catch (error: any) {
    logger.error("Error creating role:", error)
    return NextResponse.json(
      { error: error.message || "Failed to create role" },
      { status: 500 }
    )
  }
} 