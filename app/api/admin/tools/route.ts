import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/admin-check"
import { executeSQL } from "@/lib/db/data-api-adapter"

export async function GET() {
  try {
    // Check admin authorization
    const authError = await requireAdmin();
    if (authError) return authError;

    // Get all tools
    const result = await executeSQL('SELECT id, name, identifier, description FROM tools ORDER BY name')

    const tools = result.map((record) => ({
      id: String(record.id),
      name: String(record.name),
      identifier: String(record.identifier),
      description: record.description ? String(record.description) : null,
    }))

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