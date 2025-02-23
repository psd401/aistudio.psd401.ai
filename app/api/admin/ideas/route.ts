import { NextResponse } from "next/server"
import { db } from "@/db/db"
import { ideasTable } from "@/db/schema"
import { getAuth } from "@clerk/nextjs/server"
import { hasRole } from "@/utils/roles"
import { eq } from "drizzle-orm"

export async function GET() {
  try {
    const ideas = await db.query.ideasTable.findMany({
      orderBy: (ideas) => [ideas.createdAt],
    })
    return NextResponse.json({
      isSuccess: true,
      message: "Ideas retrieved successfully",
      data: ideas
    })
  } catch (error) {
    console.error("Error fetching ideas:", error)
    return NextResponse.json(
      { isSuccess: false, message: "Failed to fetch ideas" },
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

    const isStaff = await hasRole(userId, "staff")
    if (!isStaff) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const body = await request.json()
    const [idea] = await db.insert(ideasTable).values(body).returning()

    return NextResponse.json({
      isSuccess: true,
      message: "Idea created successfully",
      data: idea
    })
  } catch (error) {
    console.error("Error creating idea:", error)
    return NextResponse.json(
      { isSuccess: false, message: "Failed to create idea" },
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

    const isStaff = await hasRole(userId, "staff")
    if (!isStaff) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const body = await request.json()
    const { id, ...updates } = body

    const [idea] = await db
      .update(ideasTable)
      .set(updates)
      .where(eq(ideasTable.id, id))
      .returning()

    return NextResponse.json({
      isSuccess: true,
      message: "Idea updated successfully",
      data: idea
    })
  } catch (error) {
    console.error("Error updating idea:", error)
    return NextResponse.json(
      { isSuccess: false, message: "Failed to update idea" },
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

    const isStaff = await hasRole(userId, "staff")
    if (!isStaff) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json(
        { isSuccess: false, message: "Missing idea ID" },
        { status: 400 }
      )
    }

    const [idea] = await db
      .delete(ideasTable)
      .where(eq(ideasTable.id, parseInt(id)))
      .returning()

    return NextResponse.json({
      isSuccess: true,
      message: "Idea deleted successfully",
      data: idea
    })
  } catch (error) {
    console.error("Error deleting idea:", error)
    return NextResponse.json(
      { isSuccess: false, message: "Failed to delete idea" },
      { status: 500 }
    )
  }
} 