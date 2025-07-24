import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/admin-check"
import { 
  getSettingsAction, 
  upsertSettingAction, 
  deleteSettingAction 
} from "@/actions/db/settings-actions"
import { withErrorHandling } from "@/lib/api-utils"

// GET /api/admin/settings - Get all settings
export async function GET() {
  return withErrorHandling(async () => {
    // Check admin authorization
    const authError = await requireAdmin();
    if (authError) return authError;

    const result = await getSettingsAction()
    return NextResponse.json(result)
  })
}

// POST /api/admin/settings - Create or update a setting
export async function POST(req: NextRequest) {
  return withErrorHandling(async () => {
    // Check admin authorization
    const authError = await requireAdmin();
    if (authError) return authError;

    const body = await req.json()
    const result = await upsertSettingAction(body)
    return NextResponse.json(result)
  })
}

// DELETE /api/admin/settings?key=SETTING_KEY - Delete a setting
export async function DELETE(req: NextRequest) {
  return withErrorHandling(async () => {
    // Check admin authorization
    const authError = await requireAdmin();
    if (authError) return authError;

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