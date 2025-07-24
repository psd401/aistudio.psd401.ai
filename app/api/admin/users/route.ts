import { NextResponse } from "next/server"
import { getUsers, getUserRoles, createUser, updateUser, deleteUser } from "@/lib/db/data-api-adapter"
import { requireAdmin } from "@/lib/auth/admin-check"
import logger from "@/lib/logger"
import { transformSnakeToCamel } from "@/lib/db/field-mapper"
export async function GET() {
  try {
    // Check admin authorization
    const authError = await requireAdmin();
    if (authError) return authError;
    
    // Get users from database via Data API
    const dbUsers = await getUsers();
    const transformedUsers = transformSnakeToCamel<Array<{id: number, cognitoSub: string, email: string, firstName: string, lastName: string, lastSignInAt: string, createdAt: string, updatedAt: string}>>(dbUsers);
    
    // Get all user roles
    const userRoles = await getUserRoles();
    const transformedRoles = transformSnakeToCamel<Array<{userId: number, roleName: string}>>(userRoles);
    
    // Group roles by userId
    const rolesByUser = transformedRoles.reduce((acc, role) => {
      acc[role.userId] = acc[role.userId] || [];
      acc[role.userId].push(role.roleName);
      return acc;
    }, {} as Record<number, string[]>);
    
    // Map to the format expected by the UI
    const users = transformedUsers.map(dbUser => {
      const userRolesList = rolesByUser[dbUser.id] || []

      return {
        ...dbUser,
        role: userRolesList[0] || "",
        roles: userRolesList.map((name: string) => ({ name }))
      }
    })

    return NextResponse.json({
      isSuccess: true,
      message: "Users retrieved successfully",
      data: users
    });
  } catch (error) {
    logger.error("Error fetching users:", error);
    return NextResponse.json(
      { isSuccess: false, message: "Failed to fetch users" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    // Check admin authorization
    const authError = await requireAdmin();
    if (authError) return authError;
    
    const body = await request.json()
    const userData = {
      cognitoSub: body.cognitoSub,
      firstName: body.firstName,
      lastName: body.lastName,
      email: body.email
    }

    const user = await createUser(userData)
    const transformedUser = transformSnakeToCamel(user)

    return NextResponse.json({
      isSuccess: true,
      message: "User created successfully",
      data: transformedUser
    })
  } catch (error) {
    logger.error("Error creating user:", error)
    return NextResponse.json(
      { isSuccess: false, message: "Failed to create user" },
      { status: 500 }
    )
  }
}

export async function PUT(request: Request) {
  try {
    // Check admin authorization
    const authError = await requireAdmin();
    if (authError) return authError;

    const body = await request.json()
    const { id, ...updates } = body

    const user = await updateUser(String(id), updates)
    const transformedUser = transformSnakeToCamel(user)

    return NextResponse.json({
      isSuccess: true,
      message: "User updated successfully",
      data: transformedUser
    })
  } catch (error) {
    logger.error("Error updating user:", error)
    return NextResponse.json(
      { isSuccess: false, message: "Failed to update user" },
      { status: 500 }
    )
  }
}

export async function DELETE(request: Request) {
  try {
    // Check admin authorization
    const authError = await requireAdmin();
    if (authError) return authError;

    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json(
        { isSuccess: false, message: "Missing user ID" },
        { status: 400 }
      )
    }

    const user = await deleteUser(id)

    return NextResponse.json({
      isSuccess: true,
      message: "User deleted successfully",
      data: user
    })
  } catch (error) {
    logger.error("Error deleting user:", error)
    return NextResponse.json(
      { isSuccess: false, message: "Failed to delete user" },
      { status: 500 }
    )
  }
} 