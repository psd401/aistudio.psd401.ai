import { NextResponse } from "next/server"
import { getUsers, getUserRoles, createUser, updateUser, deleteUser } from "@/lib/db/data-api-adapter"
import { requireAdmin } from "@/lib/auth/admin-check"

export async function GET(request: Request) {
  try {
    // Check admin authorization
    const authError = await requireAdmin();
    if (authError) return authError;
    
    // Get users from database via Data API
    const dbUsers = await getUsers();
    
    // Get all user roles
    const userRoles = await getUserRoles();
    
    // Group roles by userId
    const rolesByUser = userRoles.reduce((acc, role) => {
      acc[role.user_id] = acc[role.user_id] || [];
      acc[role.user_id].push(role.role_name);
      return acc;
    }, {} as Record<number, string[]>);
    
    // Map to the format expected by the UI
    const users = dbUsers.map(dbUser => {
      const userRolesList = rolesByUser[dbUser.id] || []

      return {
        ...dbUser,
        firstName: dbUser.first_name,
        lastName: dbUser.last_name,
        lastSignInAt: dbUser.last_sign_in_at,
        role: userRolesList[0] || "",
        roles: userRolesList.map(name => ({ name }))
      }
    })

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
    // Check admin authorization
    const authError = await requireAdmin();
    if (authError) return authError;

    const body = await request.json()
    const { id, ...updates } = body

    const user = await updateUser(String(id), updates)

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
    console.error("Error deleting user:", error)
    return NextResponse.json(
      { isSuccess: false, message: "Failed to delete user" },
      { status: 500 }
    )
  }
} 