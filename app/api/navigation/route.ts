import { NextResponse, NextRequest } from "next/server"
import { getServerSession } from "@/lib/auth/server-session"
import { getNavigationItems as getNavigationItemsViaDataAPI } from "@/lib/db/data-api-adapter"

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
export async function GET(request: NextRequest) {
  try {
    // Check if user is authenticated using NextAuth
    const session = await getServerSession()
    
    if (!session) {
      return NextResponse.json(
        { isSuccess: false, message: "Unauthorized" },
        { status: 401 }
      )
    }
    
    // Check if Data API is configured
    if (!process.env.RDS_RESOURCE_ARN || !process.env.RDS_SECRET_ARN) {
      console.error("Missing RDS configuration:", {
        RDS_RESOURCE_ARN: process.env.RDS_RESOURCE_ARN ? 'set' : 'missing',
        RDS_SECRET_ARN: process.env.RDS_SECRET_ARN ? 'set' : 'missing',
        AWS_REGION: process.env.AWS_REGION || 'not set',
        AWS_DEFAULT_REGION: process.env.AWS_DEFAULT_REGION || 'not set',
        NEXT_PUBLIC_AWS_REGION: process.env.NEXT_PUBLIC_AWS_REGION || 'not set'
      });
      return NextResponse.json(
        {
          isSuccess: false,
          message: "Database not configured. Please set RDS_RESOURCE_ARN and RDS_SECRET_ARN in your environment."
        },
        { status: 500 }
      )
    }
    
    try {
      const navItems = await getNavigationItemsViaDataAPI();

      // Format the navigation items
      const formattedNavItems = navItems.map(item => ({
        id: item.id,
        label: item.label,
        icon: item.icon,
        link: item.link,
        parent_id: item.parent_id,
        parent_label: null, // This column doesn't exist in the table
        tool_id: item.tool_id,
        position: item.position,
        type: item.type || 'link',
        description: item.description || null,
        color: null // This column doesn't exist in the current table
      }))

      return NextResponse.json({
        isSuccess: true,
        data: formattedNavItems
      })
      
    } catch (error) {
      console.error("Data API error:", error);
      // Log more details about the error
      if (error instanceof Error) {
        console.error("Error details:", {
          name: error.name,
          message: error.message,
          stack: error.stack?.split('\n').slice(0, 5).join('\n')
        });
      }
      return NextResponse.json(
        {
          isSuccess: false,
          message: "Failed to fetch navigation items",
          error: error instanceof Error ? error.message : "Unknown error"
        },
        { status: 500 }
      )
    }
    
  } catch (error) {
    console.error("Error in navigation API:", error)
    // Log more details about the error
    if (error instanceof Error) {
      console.error("Outer error details:", {
        name: error.name,
        message: error.message,
        stack: error.stack?.split('\n').slice(0, 5).join('\n')
      });
    }
    return NextResponse.json(
      {
        isSuccess: false,
        message: error instanceof Error ? error.message : "Failed to fetch navigation"
      },
      { status: 500 }
    )
  }
} 