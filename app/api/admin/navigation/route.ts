import { NextResponse } from "next/server"
import { getAuth } from "@clerk/nextjs/server"
import { db } from "@/db/query"
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
    console.log("Received body:", JSON.stringify(body, null, 2));

    // Validate required fields
    if (!body.label || !body.icon || !body.type) {
      return NextResponse.json(
        { isSuccess: false, message: "Missing required fields" },
        { status: 400 }
      )
    }

    // Check if this is an update operation by looking for the item in the database
    const existingItem = body.id ? await db
      .select()
      .from(navigationItemsTable)
      .where(eq(navigationItemsTable.id, body.id))
      .then(items => items[0])
      : null;

    // If the item exists, update it
    if (existingItem) {
      const { id, ...data } = body;
      console.log("Updating existing item:", id);
      try {
        const [updatedItem] = await db
          .update(navigationItemsTable)
          .set(data)
          .where(eq(navigationItemsTable.id, id))
          .returning()

        if (!updatedItem) {
          throw new Error("Failed to update item");
        }

        return NextResponse.json({
          isSuccess: true,
          message: "Navigation item updated successfully",
          data: updatedItem
        })
      } catch (error) {
        console.error("Database error during update:", error);
        return NextResponse.json(
          { isSuccess: false, message: "Failed to update navigation item" },
          { status: 500 }
        )
      }
    } 
    // Otherwise, create new item
    else {
      console.log("Creating new item:", body.id);
      try {
        const [newItem] = await db
          .insert(navigationItemsTable)
          .values(body)
          .returning()

        if (!newItem) {
          throw new Error("Failed to create item");
        }

        return NextResponse.json({
          isSuccess: true,
          message: "Navigation item created successfully",
          data: newItem
        })
      } catch (error) {
        console.error("Database error during insert:", error);
        return NextResponse.json(
          { isSuccess: false, message: "Failed to create navigation item" },
          { status: 500 }
        )
      }
    }
  } catch (error) {
    console.error("Error in navigation POST route:", error)
    return NextResponse.json(
      { 
        isSuccess: false, 
        message: error instanceof Error ? error.message : "Failed to handle navigation item request"
      },
      { status: 500 }
    )
  }
}

export async function PATCH(request: Request) {
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
    console.log("PATCH request body:", body)
    
    if (!body.id || typeof body.position !== 'number') {
      return NextResponse.json(
        { isSuccess: false, message: "Missing id or position" },
        { status: 400 }
      )
    }

    try {
      const [updatedItem] = await db
        .update(navigationItemsTable)
        .set({ position: body.position })
        .where(eq(navigationItemsTable.id, body.id))
        .returning()

      console.log("Updated item:", updatedItem)

      if (!updatedItem) {
        return NextResponse.json(
          { isSuccess: false, message: "Item not found" },
          { status: 404 }
        )
      }

      return NextResponse.json({
        isSuccess: true,
        message: "Position updated successfully",
        data: updatedItem
      })
    } catch (error) {
      console.error("Database error:", error)
      throw error
    }
  } catch (error) {
    console.error("Error updating position:", error)
    return NextResponse.json(
      { 
        isSuccess: false, 
        message: error instanceof Error ? error.message : "Failed to update position"
      },
      { status: 500 }
    )
  }
} 