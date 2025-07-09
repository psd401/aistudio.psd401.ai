import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/admin-check"
import { 
  updateAssistantArchitect, 
  deleteAssistantArchitect,
  approveAssistantArchitect,
  rejectAssistantArchitect
} from "@/lib/db/data-api-adapter"

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    // Check admin authorization
    const authError = await requireAdmin();
    if (authError) return authError;

    const body = await request.json()
    const { id } = params
    
    const assistantId = parseInt(id, 10)
    if (isNaN(assistantId)) {
      return NextResponse.json(
        { isSuccess: false, message: 'Invalid assistant ID' },
        { status: 400 }
      )
    }

    const assistant = await updateAssistantArchitect(assistantId, body)

    return NextResponse.json({
      isSuccess: true,
      message: 'Assistant updated successfully',
      data: assistant
    })
  } catch (error) {
    console.error('Error updating assistant:', error)
    return NextResponse.json(
      { isSuccess: false, message: 'Failed to update assistant' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    // Check admin authorization
    const authError = await requireAdmin();
    if (authError) return authError;

    const { id } = params
    
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
    console.error('Error deleting assistant:', error)
    return NextResponse.json(
      { isSuccess: false, message: 'Failed to delete assistant' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    // Check admin authorization
    const authError = await requireAdmin();
    if (authError) return authError;

    const body = await request.json()
    const { id } = params
    
    const assistantId = parseInt(id, 10)
    if (isNaN(assistantId)) {
      return NextResponse.json(
        { isSuccess: false, message: 'Invalid assistant ID' },
        { status: 400 }
      )
    }

    if (body.action === 'approve') {
      const result = await approveAssistantArchitect(assistantId)
      return NextResponse.json({
        isSuccess: true,
        message: 'Assistant approved successfully',
        data: result
      })
    }

    if (body.action === 'reject') {
      await rejectAssistantArchitect(assistantId)
      return NextResponse.json({
        isSuccess: true,
        message: 'Assistant rejected successfully'
      })
    }

    return NextResponse.json(
      { isSuccess: false, message: 'Invalid action' },
      { status: 400 }
    )
  } catch (error) {
    console.error('Error processing assistant action:', error)
    return NextResponse.json(
      { isSuccess: false, message: 'Failed to process action' },
      { status: 500 }
    )
  }
}