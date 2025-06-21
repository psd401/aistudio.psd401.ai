import { NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth/server-session"
import { checkUserRoleByCognitoSub } from "@/lib/db/data-api-adapter"
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

    const body = await request.json()
    const { id } = params

    const assistant = await updateAssistantArchitect(id, body)

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

    const { id } = params

    await deleteAssistantArchitect(id)

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

    const body = await request.json()
    const { id } = params

    if (body.action === 'approve') {
      const result = await approveAssistantArchitect(id)
      return NextResponse.json({
        isSuccess: true,
        message: 'Assistant approved successfully',
        data: result
      })
    }

    if (body.action === 'reject') {
      await rejectAssistantArchitect(id)
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