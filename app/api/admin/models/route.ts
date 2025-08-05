import { NextResponse } from 'next/server';
import { getAIModels, createAIModel, updateAIModel, deleteAIModel } from '@/lib/db/data-api-adapter';
import { requireAdmin } from '@/lib/auth/admin-check';
import { createLogger, generateRequestId, startTimer } from '@/lib/logger';

export async function GET() {
  const requestId = generateRequestId();
  const timer = startTimer("api.admin.models.list");
  const log = createLogger({ requestId, route: "api.admin.models" });
  
  log.info("GET /api/admin/models - Fetching AI models");
  
  try {
    // Check admin authorization
    const authError = await requireAdmin();
    if (authError) {
      log.warn("Unauthorized admin access attempt");
      timer({ status: "error", reason: "unauthorized" });
      return authError;
    }
    
    const models = await getAIModels();

    log.info("Models retrieved successfully", { count: models.length });
    timer({ status: "success", count: models.length });
    
    return NextResponse.json(
      {
        isSuccess: true,
        message: "Models retrieved successfully",
        data: models
      },
      { headers: { "X-Request-Id": requestId } }
    );
  } catch (error) {
    timer({ status: "error" });
    log.error("Error fetching models:", error);
    return NextResponse.json(
      { isSuccess: false, message: "Failed to fetch models" },
      { status: 500, headers: { "X-Request-Id": requestId } }
    );
  }
}

export async function POST(request: Request) {
  const requestId = generateRequestId();
  const timer = startTimer("api.admin.models.create");
  const log = createLogger({ requestId, route: "api.admin.models" });
  
  log.info("POST /api/admin/models - Creating AI model");
  
  try {
    // Check admin authorization
    const authError = await requireAdmin();
    if (authError) {
      log.warn("Unauthorized admin access attempt");
      timer({ status: "error", reason: "unauthorized" });
      return authError;
    }

    const body = await request.json();
    
    log.debug("Creating model", { modelName: body.name, provider: body.provider });
    const modelData = {
      name: body.name,
      modelId: body.modelId,
      provider: body.provider,
      description: body.description,
      capabilities: body.capabilities,
      maxTokens: body.maxTokens ? parseInt(body.maxTokens) : undefined,
      isActive: body.active ?? true,
      chatEnabled: body.chatEnabled ?? false
    };

    const model = await createAIModel(modelData);

    log.info("Model created successfully", { modelId: model.id });
    timer({ status: "success" });
    
    return NextResponse.json(
      {
        isSuccess: true,
        message: 'Model created successfully',
        data: model
      },
      { headers: { "X-Request-Id": requestId } }
    );
  } catch (error) {
    timer({ status: "error" });
    log.error('Error creating model:', error);
    return NextResponse.json(
      { isSuccess: false, message: 'Failed to create model' },
      { status: 500, headers: { "X-Request-Id": requestId } }
    );
  }
}

export async function PUT(request: Request) {
  const requestId = generateRequestId();
  const timer = startTimer("api.admin.models.update");
  const log = createLogger({ requestId, route: "api.admin.models" });
  
  log.info("PUT /api/admin/models - Updating AI model");
  
  try {
    // Check admin authorization
    const authError = await requireAdmin();
    if (authError) {
      log.warn("Unauthorized admin access attempt");
      timer({ status: "error", reason: "unauthorized" });
      return authError;
    }

    const body = await request.json();
    const { id, ...updates } = body;
    
    log.debug("Updating model", { modelId: id, updates });
    
    // Convert maxTokens to number if present
    if (updates.maxTokens !== undefined) {
      updates.maxTokens = updates.maxTokens ? parseInt(updates.maxTokens) : null;
    }

    const model = await updateAIModel(id, updates);

    log.info("Model updated successfully", { modelId: id });
    timer({ status: "success" });
    
    return NextResponse.json(
      {
        isSuccess: true,
        message: 'Model updated successfully',
        data: model
      },
      { headers: { "X-Request-Id": requestId } }
    );
  } catch (error) {
    timer({ status: "error" });
    log.error('Error updating model:', error);
    return NextResponse.json(
      { isSuccess: false, message: 'Failed to update model' },
      { status: 500, headers: { "X-Request-Id": requestId } }
    );
  }
}

export async function DELETE(request: Request) {
  const requestId = generateRequestId();
  const timer = startTimer("api.admin.models.delete");
  const log = createLogger({ requestId, route: "api.admin.models" });
  
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  
  log.info("DELETE /api/admin/models - Deleting AI model", { modelId: id });
  
  try {
    // Check admin authorization
    const authError = await requireAdmin();
    if (authError) {
      log.warn("Unauthorized admin access attempt");
      timer({ status: "error", reason: "unauthorized" });
      return authError;
    }

    if (!id) {
      log.warn("Missing model ID in delete request");
      timer({ status: "error", reason: "missing_id" });
      return NextResponse.json(
        { isSuccess: false, message: 'Missing model ID' },
        { status: 400, headers: { "X-Request-Id": requestId } }
      );
    }

    const model = await deleteAIModel(parseInt(id));

    log.info("Model deleted successfully", { modelId: id });
    timer({ status: "success" });
    
    return NextResponse.json(
      {
        isSuccess: true,
        message: 'Model deleted successfully',
        data: model
      },
      { headers: { "X-Request-Id": requestId } }
    );
  } catch (error) {
    timer({ status: "error" });
    log.error('Error deleting model:', error);
    return NextResponse.json(
      { isSuccess: false, message: 'Failed to delete model' },
      { status: 500, headers: { "X-Request-Id": requestId } }
    );
  }
} 