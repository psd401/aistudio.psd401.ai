import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { hasToolAccess } from "@/utils/roles"
import { db } from "@/db/db"
import { usersTable, toolsTable, userRolesTable, roleToolsTable, rolesTable } from "@/db/schema"
import { eq, and, inArray } from "drizzle-orm"

export async function GET() {
  try {
    const { userId } = await auth()
    
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized", userId: null, hasAccess: false },
        { status: 401 }
      )
    }

    // 1. Get user from database
    const userResults = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.clerkId, userId))
    
    const user = userResults[0]
    
    if (!user) {
      return NextResponse.json({ 
        error: "User not found in database", 
        userId, 
        hasAccess: false 
      }, { status: 404 })
    }

    // 2. Check for chat tool
    const toolResults = await db
      .select()
      .from(toolsTable)
      .where(
        and(
          eq(toolsTable.identifier, "chat"),
          eq(toolsTable.isActive, true)
        )
      )
    
    const tool = toolResults[0]
    
    if (!tool) {
      return NextResponse.json({ 
        error: "chat tool not found or not active",
        userId,
        hasAccess: false 
      }, { status: 404 })
    }

    // 3. Get user roles
    const userRoleResults = await db
      .select({
        roleId: userRolesTable.roleId,
        roleName: rolesTable.name
      })
      .from(userRolesTable)
      .innerJoin(rolesTable, eq(userRolesTable.roleId, rolesTable.id))
      .where(eq(userRolesTable.userId, user.id))

    // 4. Check role-tool access
    const roleIds = userRoleResults.map(r => r.roleId)
    
    const roleToolResults = await db
      .select()
      .from(roleToolsTable)
      .where(
        and(
          eq(roleToolsTable.toolId, tool.id),
          inArray(roleToolsTable.roleId, roleIds.map(id => id.toString()))
        )
      )

    // 5. Direct check with hasToolAccess
    const hasAccess = await hasToolAccess(userId, "chat")

    return NextResponse.json({
      success: true,
      user: { id: user.id, clerkId: user.clerkId, email: user.email },
      tool: { id: tool.id, name: tool.name, identifier: tool.identifier },
      userRoles: userRoleResults,
      roleToolAssignments: roleToolResults,
      hasAccessResult: hasAccess,
      hasAccessDirectCheck: roleToolResults.length > 0
    })
  } catch (error) {
    console.error("Debug endpoint error:", error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
} 