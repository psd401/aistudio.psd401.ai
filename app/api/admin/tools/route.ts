import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/admin-check"
import { executeSQL } from "@/lib/db/data-api-adapter"

export async function GET() {
  try {
    // Check admin authorization
    const authError = await requireAdmin();
    if (authError) return authError;

    // Get all tools
    const result = await executeSQL({
      sql: 'SELECT id, name, identifier, description FROM tools ORDER BY name',
      database: 'aistudio',
      secretArn: process.env.DB_SECRET_ARN!,
      resourceArn: process.env.DB_RESOURCE_ARN!,
    })

    const tools = result.records?.map(record => ({
      id: record[0].longValue!.toString(),
      name: record[1].stringValue!,
      identifier: record[2].stringValue!,
      description: record[3].stringValue || null,
    })) || []

    return NextResponse.json({
      isSuccess: true,
      data: tools
    })
  } catch (error) {
    return NextResponse.json(
      { 
        isSuccess: false, 
        message: error instanceof Error ? error.message : "Failed to fetch tools"
      },
      { status: 500 }
    )
  }
}