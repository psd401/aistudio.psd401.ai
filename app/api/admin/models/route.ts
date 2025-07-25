import { NextResponse } from 'next/server';
import { getAIModels, createAIModel, updateAIModel, deleteAIModel } from '@/lib/db/data-api-adapter';
import { requireAdmin } from '@/lib/auth/admin-check';
import logger from '@/lib/logger';

export async function GET() {
  try {
    // Check admin authorization
    const authError = await requireAdmin();
    if (authError) return authError;
    
    const models = await getAIModels();

    return NextResponse.json({
      isSuccess: true,
      message: "Models retrieved successfully",
      data: models
    });
  } catch (error) {
    logger.error("Error fetching models:", error);
    return NextResponse.json(
      { isSuccess: false, message: "Failed to fetch models" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    // Check admin authorization
    const authError = await requireAdmin();
    if (authError) return authError;

    const body = await request.json();
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

    return NextResponse.json({
      isSuccess: true,
      message: 'Model created successfully',
      data: model
    });
  } catch (error) {
    logger.error('Error creating model:', error);
    return NextResponse.json(
      { isSuccess: false, message: 'Failed to create model' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    // Check admin authorization
    const authError = await requireAdmin();
    if (authError) return authError;

    const body = await request.json();
    const { id, ...updates } = body;
    
    // Convert maxTokens to number if present
    if (updates.maxTokens !== undefined) {
      updates.maxTokens = updates.maxTokens ? parseInt(updates.maxTokens) : null;
    }

    const model = await updateAIModel(id, updates);

    return NextResponse.json({
      isSuccess: true,
      message: 'Model updated successfully',
      data: model
    });
  } catch (error) {
    logger.error('Error updating model:', error);
    return NextResponse.json(
      { isSuccess: false, message: 'Failed to update model' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    // Check admin authorization
    const authError = await requireAdmin();
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { isSuccess: false, message: 'Missing model ID' },
        { status: 400 }
      );
    }

    const model = await deleteAIModel(parseInt(id));

    return NextResponse.json({
      isSuccess: true,
      message: 'Model deleted successfully',
      data: model
    });
  } catch (error) {
    logger.error('Error deleting model:', error);
    return NextResponse.json(
      { isSuccess: false, message: 'Failed to delete model' },
      { status: 500 }
    );
  }
} 