import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth/server-session"
import { hasRole } from "@/lib/auth/role-helpers"
import { testSettingConnectionAction } from "@/actions/db/settings-actions"
import { withErrorHandling, unauthorized, forbidden } from "@/lib/api-utils"

// POST /api/admin/settings/test - Test a setting connection
export async function POST(req: NextRequest) {
  return withErrorHandling(async () => {
    const session = await getServerSession()
    if (!session) {
      return unauthorized("User not authenticated")
    }

    const isAdmin = await hasRole("administrator")
    if (!isAdmin) {
      return forbidden("Only administrators can test settings")
    }

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