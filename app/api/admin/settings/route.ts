import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/admin-check"
import { 
  getSettingsAction, 
  upsertSettingAction, 
  deleteSettingAction 
} from "@/actions/db/settings-actions"
import { withErrorHandling } from "@/lib/api-utils"
import { createLogger, generateRequestId, startTimer } from "@/lib/logger"

// GET /api/admin/settings - Get all settings
export async function GET() {
  const requestId = generateRequestId();
  const timer = startTimer("api.admin.settings.list");
  const log = createLogger({ requestId, route: "api.admin.settings" });
  
  log.info("GET /api/admin/settings - Fetching settings");
  
  return withErrorHandling(async () => {
    // Check admin authorization
    const authError = await requireAdmin();
    if (authError) {
      log.warn("Unauthorized admin access attempt");
      timer({ status: "error", reason: "unauthorized" });
      return authError;
    }

    const result = await getSettingsAction()
    
    log.info("Settings fetched successfully", { count: result.data?.length || 0 });
    timer({ status: "success", count: result.data?.length || 0 });
    
    return NextResponse.json(result, { headers: { "X-Request-Id": requestId } })
  }, requestId)
}

// POST /api/admin/settings - Create or update a setting
export async function POST(req: NextRequest) {
  const requestId = generateRequestId();
  const timer = startTimer("api.admin.settings.upsert");
  const log = createLogger({ requestId, route: "api.admin.settings" });
  
  log.info("POST /api/admin/settings - Upserting setting");
  
  return withErrorHandling(async () => {
    // Check admin authorization
    const authError = await requireAdmin();
    if (authError) {
      log.warn("Unauthorized admin access attempt");
      timer({ status: "error", reason: "unauthorized" });
      return authError;
    }

    const body = await req.json()
    log.debug("Upserting setting", { key: body.key });
    
    const result = await upsertSettingAction(body)
    
    if (result.isSuccess) {
      log.info("Setting upserted successfully", { key: body.key });
      timer({ status: "success" });
    } else {
      log.warn("Failed to upsert setting", { key: body.key, message: result.message });
      timer({ status: "error", reason: "upsert_failed" });
    }
    
    return NextResponse.json(result, { headers: { "X-Request-Id": requestId } })
  }, requestId)
}

// DELETE /api/admin/settings?key=SETTING_KEY - Delete a setting
export async function DELETE(req: NextRequest) {
  const requestId = generateRequestId();
  const timer = startTimer("api.admin.settings.delete");
  const log = createLogger({ requestId, route: "api.admin.settings" });
  
  log.info("DELETE /api/admin/settings - Deleting setting");
  
  return withErrorHandling(async () => {
    // Check admin authorization
    const authError = await requireAdmin();
    if (authError) {
      log.warn("Unauthorized admin access attempt");
      timer({ status: "error", reason: "unauthorized" });
      return authError;
    }

    const key = req.nextUrl.searchParams.get("key")
    if (!key) {
      log.warn("Setting key is required");
      timer({ status: "error", reason: "missing_key" });
      return NextResponse.json(
        { isSuccess: false, message: "Setting key is required" },
        { status: 400, headers: { "X-Request-Id": requestId } }
      )
    }

    log.debug("Deleting setting", { key });
    const result = await deleteSettingAction(key)
    
    if (result.isSuccess) {
      log.info("Setting deleted successfully", { key });
      timer({ status: "success" });
    } else {
      log.warn("Failed to delete setting", { key, message: result.message });
      timer({ status: "error", reason: "delete_failed" });
    }
    
    return NextResponse.json(result, { headers: { "X-Request-Id": requestId } })
  }, requestId)
}