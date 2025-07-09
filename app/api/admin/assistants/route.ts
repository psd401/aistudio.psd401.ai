import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/admin-check"
import { getServerSession } from "@/lib/auth/server-session"
import logger from "@/lib/logger"
import { 
  getAssistantArchitects, 
  createAssistantArchitect, 
  updateAssistantArchitect, 
  deleteAssistantArchitect,
  approveAssistantArchitect,
  rejectAssistantArchitect
} from "@/lib/db/data-api-adapter"

export async function GET() {
  try {
    // Check admin authorization
    const authError = await requireAdmin();
    if (authError) return authError;

    // Get session for user ID
    const session = await getServerSession();
    if (!session || !session.sub) {
      return NextResponse.json(
        { isSuccess: false, message: "Session error" },
        { status: 500 }
      )
    }

    // Get all assistant architects
    const assistants = await getAssistantArchitects()

    return NextResponse.json({
      isSuccess: true,
      message: "Assistants retrieved successfully",
      data: assistants
    })
  } catch (error) {
    logger.error("Error fetching assistants:", error)
    return NextResponse.json(
      { isSuccess: false, message: "Failed to fetch assistants" },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    // Check admin authorization
    const authError = await requireAdmin();
    if (authError) return authError;

    // Get session for user ID
    const session = await getServerSession();
    if (!session || !session.sub) {
      return NextResponse.json(
        { isSuccess: false, message: "Session error" },
        { status: 500 }
      )
    }

    const body = await request.json()
    
    // Handle approve/reject actions
    if (body.action === 'approve') {
      const result = await approveAssistantArchitect(body.id)
      return NextResponse.json({
        isSuccess: true,
        message: 'Assistant approved successfully',
        data: result
      })
    }
    
    if (body.action === 'reject') {
      await rejectAssistantArchitect(body.id)
      return NextResponse.json({
        isSuccess: true,
        message: 'Assistant rejected successfully'
      })
    }

    // Otherwise, create new assistant
    const assistant = await createAssistantArchitect({
      name: body.name,
      description: body.description,
      userId: session.sub,
      status: body.status || 'draft'
    })

    return NextResponse.json({
      isSuccess: true,
      message: 'Assistant created successfully',
      data: assistant
    })
  } catch (error) {
    logger.error('Error creating assistant:', error)
    return NextResponse.json(
      { isSuccess: false, message: 'Failed to create assistant' },
      { status: 500 }
    )
  }
}

export async function PUT(request: Request) {
  try {
    // Check admin authorization
    const authError = await requireAdmin();
    if (authError) return authError;

    // Get session for user ID
    const session = await getServerSession();
    if (!session || !session.sub) {
      return NextResponse.json(
        { isSuccess: false, message: "Session error" },
        { status: 500 }
      )
    }

    const body = await request.json()
    const { id, ...updates } = body

    const assistant = await updateAssistantArchitect(id, updates)

    return NextResponse.json({
      isSuccess: true,
      message: 'Assistant updated successfully',
      data: assistant
    })
  } catch (error) {
    logger.error('Error updating assistant:', error)
    return NextResponse.json(
      { isSuccess: false, message: 'Failed to update assistant' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: Request) {
  try {
    // Check admin authorization
    const authError = await requireAdmin();
    if (authError) return authError;

    // Get session for user ID
    const session = await getServerSession();
    if (!session || !session.sub) {
      return NextResponse.json(
        { isSuccess: false, message: "Session error" },
        { status: 500 }
      )
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { isSuccess: false, message: 'Missing assistant ID' },
        { status: 400 }
      )
    }

    const assistantId = parseInt(id, 10)
    if (isNaN(assistantId)) {
      return NextResponse.json(
        { isSuccess: false, message: 'Invalid assistant ID' },
        { status: 400 }
      )
    }

    await deleteAssistantArchitect(assistantId)

    return NextResponse.json({
      isSuccess: true,
      message: 'Assistant deleted successfully'
    })
  } catch (error) {
    logger.error('Error deleting assistant:', error)
    return NextResponse.json(
      { isSuccess: false, message: 'Failed to delete assistant' },
      { status: 500 }
    )
  }
} 