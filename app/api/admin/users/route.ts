import { NextResponse } from "next/server"
import { db } from "@/db/db"
import { usersTable } from "@/db/schema"
import { getAuth } from "@clerk/nextjs/server"
import { hasRole } from "@/utils/roles"
import { eq, asc } from "drizzle-orm"
import type { InsertUser } from "@/types"

export async function GET() {
  try {
    const users = await db
      .select()
      .from(usersTable)
      .orderBy(asc(usersTable.createdAt));

    return NextResponse.json({
      isSuccess: true,
      message: "Users retrieved successfully",
      data: users
    })
  } catch (error) {
    console.error("Error fetching users:", error)
    return NextResponse.json(
      { isSuccess: false, message: "Failed to fetch users" },
      { status: 500 }
    )
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