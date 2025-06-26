import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth/server-session"
import { checkUserRoleByCognitoSub } from "@/lib/db/data-api-adapter"
import { getAssistantDataForExport, createExportFile } from "@/lib/assistant-export-import"
import logger from "@/lib/logger"

export async function POST(request: NextRequest) {
  try {
    // Check authentication
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

    // Get assistant IDs from request body
    const body = await request.json()
    const { assistantIds } = body

    if (!Array.isArray(assistantIds) || assistantIds.length === 0) {
      return NextResponse.json(
        { isSuccess: false, message: "No assistants selected for export" },
        { status: 400 }
      )
    }

    // Validate UUIDs
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const invalidIds = assistantIds.filter(id => !uuidRegex.test(id))
    if (invalidIds.length > 0) {
      return NextResponse.json(
        { isSuccess: false, message: `Invalid assistant IDs: ${invalidIds.join(', ')}` },
        { status: 400 }
      )
    }

    logger.info(`Exporting ${assistantIds.length} assistants`)

    // Fetch assistant data
    const assistants = await getAssistantDataForExport(assistantIds)

    if (assistants.length === 0) {
      return NextResponse.json(
        { isSuccess: false, message: "No assistants found with the provided IDs" },
        { status: 404 }
      )
    }

    // Create export file
    const exportData = createExportFile(assistants)

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
    const filename = `assistants-export-${timestamp}.json`

    // Return JSON file as download
    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache'
      }
    })

  } catch (error) {
    logger.error('Error exporting assistants:', error)
    return NextResponse.json(
      { isSuccess: false, message: 'Failed to export assistants' },
      { status: 500 }
    )
  }
}