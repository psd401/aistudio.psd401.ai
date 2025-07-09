import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/admin-check"
import { testSettingConnectionAction } from "@/actions/db/settings-actions"
import { withErrorHandling, unauthorized, forbidden } from "@/lib/api-utils"

// POST /api/admin/settings/test - Test a setting connection
export async function POST(req: NextRequest) {
  return withErrorHandling(async () => {
    // Check admin authorization
    const authError = await requireAdmin();
    if (authError) return authError;

    const { key, value } = await req.json()
    if (!key) {
      return NextResponse.json(
        { isSuccess: false, message: "Setting key is required" },
        { status: 400 }
      )
    }

    const result = await testSettingConnectionAction(key, value || "")
    return NextResponse.json(result)
  })
}