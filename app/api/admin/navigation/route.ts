import { NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth/server-session"
import { getNavigationItems, createNavigationItem, updateNavigationItem } from "@/lib/db/data-api-adapter"
import { checkUserRoleByCognitoSub } from "@/lib/db/data-api-adapter"

export async function GET() {
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
    const transformedItems = navItems.map((item) => ({
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

    // Validate required fields
    if (!body.label || !body.icon || !body.type) {
      return NextResponse.json(
        { isSuccess: false, message: "Missing required fields" },
        { status: 400 }
      )
    }

    // Check if this is an update operation by checking if the item exists
    if (body.id) {
      // First check if this ID exists in the database
      const existingItems = await getNavigationItems();
      const itemExists = existingItems.some(item => item.id === body.id);
      
      if (itemExists) {
        // This is an update operation
        const { id, ...data } = body;
        try {
          const updatedItem = await updateNavigationItem(parseInt(id, 10), data)

          return NextResponse.json({
            isSuccess: true,
            message: "Navigation item updated successfully",
            data: updatedItem
          })
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Failed to update navigation item";
          return NextResponse.json(
            { isSuccess: false, message: errorMessage },
            { status: 500 }
          )
        }
      }
      // If the item doesn't exist, fall through to create it
    }
    
    // Create new item (ID will be auto-generated)
    try {
      const newItem = await createNavigationItem({
        label: body.label,
        icon: body.icon,
        link: body.link,
        description: body.description,
        type: body.type,
        parentId: body.parentId ? parseInt(body.parentId, 10) : undefined,
        toolId: body.toolId ? parseInt(body.toolId, 10) : undefined,
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
      const errorMessage = error instanceof Error ? error.message : "Failed to create navigation item";
      return NextResponse.json(
        { isSuccess: false, message: errorMessage },
        { status: 500 }
      )
    }
  } catch (error) {
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
    
    if (!body.id || typeof body.position !== 'number') {
      return NextResponse.json(
        { isSuccess: false, message: "Missing id or position" },
        { status: 400 }
      )
    }

    try {
      const updatedItem = await updateNavigationItem(parseInt(body.id, 10), { position: body.position })


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
      throw error
    }
  } catch (error) {
    return NextResponse.json(
      { 
        isSuccess: false, 
        message: error instanceof Error ? error.message : "Failed to update position"
      },
      { status: 500 }
    )
  }
} 