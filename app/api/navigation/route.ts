import { NextResponse } from "next/server"
import { getAuth } from "@clerk/nextjs/server"
import { db } from "@/db/db"
import { navigationItemsTable, toolsTable } from "@/db/schema"
import { eq, isNull, inArray } from "drizzle-orm"
import { getUserTools, hasRole } from "@/utils/roles"

/**
 * Navigation API
 * 
 * Returns navigation items filtered by user permissions:
 * - Returns top-level items (parent_id = null) and their children
 * - Filters items requiring tools the user doesn't have access to
 * - Hides admin items for non-admin users
 * - Preserves the parent-child relationship for proper nesting in the UI
 * 
 * Response format:
 * {
 *   isSuccess: boolean,
 *   data: [
 *     {
 *       id: string,
 *       label: string,
 *       icon: string, // Icon name from iconMap
 *       link: string | null, // If null, this is a dropdown section
 *       parent_id: string | null, // If null, this is a top-level item
 *       parent_label: string | null,
 *       tool_id: string | null, // If provided, requires tool access
 *       position: number // For ordering items
 *     },
 *     ...
 *   ]
 * }
 */
export async function GET(request: Request) {
  try {
    const { userId } = getAuth(request)
    if (!userId) {
      return NextResponse.json(
        { isSuccess: false, message: "Unauthorized" },
        { status: 401 }
      )
    }

    // Get all navigation items
    const navItems = await db.query.navigationItemsTable.findMany({
      where: eq(navigationItemsTable.isActive, true),
      orderBy: navigationItemsTable.position
    })

    // Get user's tools by identifier
    const userTools = await getUserTools(userId)
    
    // Get tool IDs that correspond to the tool identifiers
    const toolsWithIds = await db
      .select({
        id: toolsTable.id,
        identifier: toolsTable.identifier
      })
      .from(toolsTable)
      .where(eq(toolsTable.isActive, true))
    
    // Create a mapping of tool IDs to identifiers
    const toolIdentifiersById = {} as Record<string, string>
    toolsWithIds.forEach(tool => {
      toolIdentifiersById[tool.id] = tool.identifier
    })
    
    // Check if user is admin
    const isAdmin = await hasRole(userId, 'administrator')
    
    // Process each nav item for display 
    const formattedNavItems = navItems.map(item => {
      // Skip admin items for non-admins
      if (item.id === 'admin' && !isAdmin) {
        return null
      }
      
      // If item requires a tool, check access
      if (item.toolId) {
        const toolIdentifier = toolIdentifiersById[item.toolId]
        // Skip if user doesn't have access to this tool
        if (!toolIdentifier || !userTools.includes(toolIdentifier)) {
          return null
        }
      }
      
      // Include the item with all necessary properties for the UI
      return {
        id: item.id,
        label: item.label,
        icon: item.icon,
        link: item.link,
        parent_id: item.parentId,
        parent_label: item.parentLabel,
        tool_id: item.toolId,
        position: item.position
      }
    }).filter(Boolean)
    
    return NextResponse.json({
      isSuccess: true,
      data: formattedNavItems
    })
  } catch (error) {
    console.error("Error fetching navigation:", error)
    return NextResponse.json(
      { 
        isSuccess: false, 
        message: error instanceof Error ? error.message : "Failed to fetch navigation"
      },
      { status: 500 }
    )
  }
} 