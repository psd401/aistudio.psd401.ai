import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/admin-check"
import { getAssistantDataForExport, createExportFile } from "@/lib/assistant-export-import"
import logger from "@/lib/logger"

export async function POST(request: NextRequest) {
  try {
    // Check admin authorization
    const authError = await requireAdmin();
    if (authError) return authError;

    // Get assistant IDs from request body
    const body = await request.json()
    const { assistantIds } = body

    if (!Array.isArray(assistantIds) || assistantIds.length === 0) {
      return NextResponse.json(
        { isSuccess: false, message: "No assistants selected for export" },
        { status: 400 }
      )
    }

    // Validate IDs are numbers
    const invalidIds = assistantIds.filter(id => !Number.isInteger(id) || id <= 0)
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