import { NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth/server-session"
import { deleteNavigationItem } from "@/lib/db/data-api-adapter"
import { checkUserRoleByCognitoSub } from "@/lib/db/data-api-adapter"

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

    // Delete the navigation item
    await deleteNavigationItem(id)

    return NextResponse.json({
      isSuccess: true,
      message: "Navigation item deleted successfully"
    })
  } catch (error) {
    console.error("Error deleting navigation item:", error)
    return NextResponse.json(
      { 
        isSuccess: false, 
        message: error instanceof Error ? error.message : "Failed to delete navigation item"
      },
      { status: 500 }
    )
  }
} 