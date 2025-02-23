import { NextResponse } from "next/server"
import { db } from "@/db/db"
import { communicationSettingsTable } from "@/db/schema"

export async function GET() {
  try {
    const [settings] = await db.select().from(communicationSettingsTable).limit(1)
    return NextResponse.json({
      isSuccess: true,
      message: "Settings retrieved successfully",
      data: settings
    })
  } catch (error) {
    return NextResponse.json(
      { isSuccess: false, message: "Failed to fetch settings" },
      { status: 500 }
    )
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const { minimumRole } = body

    const [settings] = await db
      .update(communicationSettingsTable)
      .set({ minimumRole, updatedAt: new Date() })
      .returning()

    return NextResponse.json({
      isSuccess: true,
      message: "Settings updated successfully",
      data: settings
    })
  } catch (error) {
    return NextResponse.json(
      { isSuccess: false, message: "Failed to update settings" },
      { status: 500 }
    )
  }
} 