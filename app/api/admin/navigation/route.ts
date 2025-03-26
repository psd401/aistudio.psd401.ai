import { NextResponse } from "next/server"
import { getAuth } from "@clerk/nextjs/server"
import { db } from "@/db/db"
import { navigationItemsTable } from "@/db/schema"
import { eq } from "drizzle-orm"
import { hasRole } from "@/utils/roles"

export async function GET(request: Request) {
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

    // Get all navigation items
    const navItems = await db
      .select()
      .from(navigationItemsTable)
      .orderBy(navigationItemsTable.position)

    return NextResponse.json({
      isSuccess: true,
      data: navItems
    })
  } catch (error) {
    console.error("Error fetching navigation items:", error)
    return NextResponse.json(
      { 
        isSuccess: false, 
        message: error instanceof Error ? error.message : "Failed to fetch navigation items"
      },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
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

    const body = await request.json()
    const { id, ...data } = body

    // If id is provided, update existing item
    if (id) {
      const [updatedItem] = await db
        .update(navigationItemsTable)
        .set(data)
        .where(eq(navigationItemsTable.id, id))
        .returning()

      return NextResponse.json({
        isSuccess: true,
        message: "Navigation item updated successfully",
        data: updatedItem
      })
    } 
    // Otherwise, create new item
    else {
      const [newItem] = await db
        .insert(navigationItemsTable)
        .values(data)
        .returning()

      return NextResponse.json({
        isSuccess: true,
        message: "Navigation item created successfully",
        data: newItem
      })
    }
  } catch (error) {
    console.error("Error updating navigation item:", error)
    return NextResponse.json(
      { 
        isSuccess: false, 
        message: error instanceof Error ? error.message : "Failed to update navigation item"
      },
      { status: 500 }
    )
  }
} 