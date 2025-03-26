import { NextResponse } from "next/server"
import { db } from "@/db/db"
import { usersTable, userRolesTable, rolesTable } from "@/db/schema"
import { getAuth } from "@clerk/nextjs/server"
import { hasRole } from "@/utils/roles"
import { eq, asc } from "drizzle-orm"
import type { InsertUser } from "@/types"

export async function GET(request: Request) {
  try {
    // Check authorization
    const { userId } = getAuth(request);
    if (!userId) {
      return NextResponse.json(
        { isSuccess: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const isAdmin = await hasRole(userId, "administrator");
    if (!isAdmin) {
      return NextResponse.json(
        { isSuccess: false, message: "Forbidden - Admin access required" },
        { status: 403 }
      );
    }

    // Get users from database
    const dbUsers = await db
      .select({
        id: usersTable.id,
        clerkId: usersTable.clerkId,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        email: usersTable.email,
        lastSignInAt: usersTable.lastSignInAt,
        createdAt: usersTable.createdAt,
        updatedAt: usersTable.updatedAt
      })
      .from(usersTable)
      .orderBy(asc(usersTable.createdAt));
    
    // Get all roles
    const userRoles = await db
      .select({
        userId: userRolesTable.userId,
        roleName: rolesTable.name
      })
      .from(userRolesTable)
      .innerJoin(rolesTable, eq(rolesTable.id, userRolesTable.roleId))
      .orderBy(asc(rolesTable.name));
    
    // Group roles by userId
    const rolesByUser = userRoles.reduce((acc, role) => {
      acc[role.userId] = acc[role.userId] || [];
      acc[role.userId].push(role.roleName);
      return acc;
    }, {} as Record<number, string[]>);
    
    // Map to the format expected by the UI
    const users = dbUsers.map(dbUser => {
      const userRolesList = rolesByUser[dbUser.id] || [];
      
      return {
        ...dbUser,
        id: dbUser.id,
        clerkId: dbUser.clerkId || '',
        firstName: dbUser.firstName || '',
        lastName: dbUser.lastName || '',
        email: dbUser.email || '',
        lastSignInAt: dbUser.lastSignInAt || null,
        createdAt: dbUser.createdAt || new Date(),
        updatedAt: dbUser.updatedAt || new Date(),
        role: userRolesList[0] || '',
        roles: userRolesList.map(name => ({ name }))
      };
    });

    return NextResponse.json({
      isSuccess: true,
      message: "Users retrieved successfully",
      data: users
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    return NextResponse.json(
      { isSuccess: false, message: "Failed to fetch users" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = getAuth(request)
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const isAdmin = await hasRole(userId, "administrator")
    if (!isAdmin) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const body = await request.json()
    const userData: InsertUser = {
      ...body,
      clerkId: body.clerkId || userId,
    }

    const [user] = await db.insert(usersTable).values(userData).returning()

    return NextResponse.json({
      isSuccess: true,
      message: "User created successfully",
      data: user
    })
  } catch (error) {
    console.error("Error creating user:", error)
    return NextResponse.json(
      { isSuccess: false, message: "Failed to create user" },
      { status: 500 }
    )
  }
}

export async function PUT(request: Request) {
  try {
    const { userId } = getAuth(request)
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const isAdmin = await hasRole(userId, "administrator")
    if (!isAdmin) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const body = await request.json()
    const { id, ...updates } = body

    const [user] = await db
      .update(usersTable)
      .set(updates)
      .where(eq(usersTable.id, id))
      .returning()

    return NextResponse.json({
      isSuccess: true,
      message: "User updated successfully",
      data: user
    })
  } catch (error) {
    console.error("Error updating user:", error)
    return NextResponse.json(
      { isSuccess: false, message: "Failed to update user" },
      { status: 500 }
    )
  }
}

export async function DELETE(request: Request) {
  try {
    const { userId } = getAuth(request)
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const isAdmin = await hasRole(userId, "administrator")
    if (!isAdmin) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json(
        { isSuccess: false, message: "Missing user ID" },
        { status: 400 }
      )
    }

    const [user] = await db
      .delete(usersTable)
      .where(eq(usersTable.id, parseInt(id)))
      .returning()

    return NextResponse.json({
      isSuccess: true,
      message: "User deleted successfully",
      data: user
    })
  } catch (error) {
    console.error("Error deleting user:", error)
    return NextResponse.json(
      { isSuccess: false, message: "Failed to delete user" },
      { status: 500 }
    )
  }
} 