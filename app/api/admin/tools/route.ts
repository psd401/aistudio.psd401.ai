import { NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth/server-session"
import { executeSQL, checkUserRoleByCognitoSub } from "@/lib/db/data-api-adapter"

export async function GET() {
  try {
    // Check authentication using AWS Cognito
    const session = await getServerSession()
    if (!session || !session.sub) {
      return NextResponse.json(
        { isSuccess: false, message: "Unauthorized" },
        { status: 401 }
      )
    }

    // Check if user is admin
    const isAdmin = await checkUserRoleByCognitoSub(session.sub, 'administrator')
    if (!isAdmin) {
      return NextResponse.json(
        { isSuccess: false, message: "Forbidden - Admin access required" },
        { status: 403 }
      )
    }

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