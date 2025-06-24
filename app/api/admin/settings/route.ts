import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth/server-session"
import { hasRole } from "@/lib/auth/role-helpers"
import { 
  getSettingsAction, 
  upsertSettingAction, 
  deleteSettingAction 
} from "@/actions/db/settings-actions"
import { withErrorHandling, unauthorized, forbidden } from "@/lib/api-utils"

// GET /api/admin/settings - Get all settings
export async function GET(req: NextRequest) {
  return withErrorHandling(async () => {
    const session = await getServerSession()
    if (!session) {
      return unauthorized("User not authenticated")
    }

    const isAdmin = await hasRole("administrator")
    if (!isAdmin) {
      return forbidden("Only administrators can view settings")
    }

    const result = await getSettingsAction()
    return NextResponse.json(result)
  })
}

// POST /api/admin/settings - Create or update a setting
export async function POST(req: NextRequest) {
  return withErrorHandling(async () => {
    const session = await getServerSession()
    if (!session) {
      return unauthorized("User not authenticated")
    }

    const isAdmin = await hasRole("administrator")
    if (!isAdmin) {
      return forbidden("Only administrators can manage settings")
    }

    const body = await req.json()
    const result = await upsertSettingAction(body)
    return NextResponse.json(result)
  })
}

// DELETE /api/admin/settings?key=SETTING_KEY - Delete a setting
export async function DELETE(req: NextRequest) {
  return withErrorHandling(async () => {
    const session = await getServerSession()
    if (!session) {
      return unauthorized("User not authenticated")
    }

    const isAdmin = await hasRole("administrator")
    if (!isAdmin) {
      return forbidden("Only administrators can delete settings")
    }

    const key = req.nextUrl.searchParams.get("key")
    if (!key) {
      return NextResponse.json(
        { isSuccess: false, message: "Setting key is required" },
        { status: 400 }
      )
    }

    const result = await deleteSettingAction(key)
    return NextResponse.json(result)
  })
}