import { NextResponse } from "next/server"
import { getAuth } from "@clerk/nextjs/server"
import { db } from "@/db/db"
import { navigationItemsTable } from "@/db/schema"
import { eq } from "drizzle-orm"
import { hasRole } from "@/utils/roles"

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = getAuth(request)
    if (!userId) {
      return NextResponse.json(
        { isSuccess: false, message: "Unauthorized" },
        { status: 401 }
      )
    }

    // Check if user is admin
    const isAdmin = await hasRole(userId, 'administrator')
    if (!isAdmin) {
      return NextResponse.json(
        { isSuccess: false, message: "Forbidden - Admin access required" },
        { status: 403 }
      )
    }

    const { id } = params

    // Delete the navigation item
    await db
      .delete(navigationItemsTable)
      .where(eq(navigationItemsTable.id, id))

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