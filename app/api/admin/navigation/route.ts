import { NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth/server-session"
import { getNavigationItems, createNavigationItem, updateNavigationItem } from "@/lib/db/data-api-adapter"
import { checkUserRoleByCognitoSub } from "@/lib/db/data-api-adapter"

export async function GET(request: Request) {
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

    // Get all navigation items (not just active ones for admin)
    const navItems = await getNavigationItems(false)
    
    // Transform snake_case to camelCase
    const transformedItems = navItems.map((item: any) => ({
      id: item.id,
      label: item.label,
      icon: item.icon,
      link: item.link,
      description: item.description,
      type: item.type,
      parentId: item.parent_id,
      toolId: item.tool_id,
      requiresRole: item.requires_role,
      position: item.position,
      isActive: item.is_active,
      createdAt: item.created_at
    }))

    return NextResponse.json({
      isSuccess: true,
      data: transformedItems
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
    console.log("Received body:", JSON.stringify(body, null, 2));

    // Validate required fields
    if (!body.label || !body.icon || !body.type) {
      return NextResponse.json(
        { isSuccess: false, message: "Missing required fields" },
        { status: 400 }
      )
    }

    // Check if this is an update operation
    if (body.id) {
      const { id, ...data } = body;
      console.log("Updating existing item:", id);
      try {
        const updatedItem = await updateNavigationItem(id, data)

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
      // Generate a unique ID for new items
      const newId = `nav_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
      console.log("Creating new item with ID:", newId);
      try {
        const newItem = await createNavigationItem({
          id: newId,
          label: body.label,
          icon: body.icon,
          link: body.link,
          description: body.description,
          type: body.type,
          parentId: body.parentId,
          toolId: body.toolId,
          requiresRole: body.requiresRole,
          position: body.position || 0,
          isActive: body.isActive ?? true
        })

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
    console.log("PATCH request body:", body)
    
    if (!body.id || typeof body.position !== 'number') {
      return NextResponse.json(
        { isSuccess: false, message: "Missing id or position" },
        { status: 400 }
      )
    }

    try {
      const updatedItem = await updateNavigationItem(body.id, { position: body.position })

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