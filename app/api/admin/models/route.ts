import { NextResponse } from 'next/server';
import { getAIModels, createAIModel, updateAIModel, deleteAIModel } from '@/lib/db/data-api-adapter';
import { cookies } from 'next/headers';

export async function GET() {
  try {
    const modelsData = await getAIModels();
    
    // Transform snake_case to camelCase for consistency
    const models = modelsData.map(model => ({
      id: model.id,
      name: model.name,
      provider: model.provider,
      modelId: model.model_id,
      description: model.description,
      capabilities: model.capabilities,
      maxTokens: model.max_tokens,
      active: model.active,
      chatEnabled: model.chat_enabled,
      createdAt: model.created_at,
      updatedAt: model.updated_at
    }));

    return NextResponse.json({
      isSuccess: true,
      message: "Models retrieved successfully",
      data: models
    });
  } catch (error) {
    console.error("Error fetching models:", error);
    return NextResponse.json(
      { isSuccess: false, message: "Failed to fetch models" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    // Check authorization - temporary solution
    const cookieStore = await cookies()
    const hasAuthCookie = cookieStore.has('CognitoIdentityServiceProvider.3409udcdkhvqbs5njab7do8fsr.LastAuthUser')
    
    if (!hasAuthCookie) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // TODO: Implement proper admin check with Amplify

    const body = await request.json();
    const modelData = {
      name: body.name,
      modelId: body.modelId,
      provider: body.provider,
      description: body.description,
      capabilities: body.capabilities,
      maxTokens: body.maxTokens ? parseInt(body.maxTokens) : null,
      isActive: body.active ?? true,
      chatEnabled: body.chatEnabled ?? false
    };

    const model = await createAIModel(modelData);
    
    // Transform the response to camelCase
    const transformedModel = {
      id: model.id,
      name: model.name,
      provider: model.provider,
      modelId: model.model_id,
      description: model.description,
      capabilities: model.capabilities,
      maxTokens: model.max_tokens,
      active: model.active,
      chatEnabled: model.chat_enabled,
      createdAt: model.created_at,
      updatedAt: model.updated_at
    };

    return NextResponse.json({
      isSuccess: true,
      message: 'Model created successfully',
      data: transformedModel
    });
  } catch (error) {
    console.error('Error creating model:', error);
    return NextResponse.json(
      { isSuccess: false, message: 'Failed to create model' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    // Check authorization - temporary solution
    const cookieStore = await cookies()
    const hasAuthCookie = cookieStore.has('CognitoIdentityServiceProvider.3409udcdkhvqbs5njab7do8fsr.LastAuthUser')
    
    if (!hasAuthCookie) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // TODO: Implement proper admin check with Amplify

    const body = await request.json();
    const { id, ...updates } = body;
    
    // Convert maxTokens to number if present
    if (updates.maxTokens !== undefined) {
      updates.maxTokens = updates.maxTokens ? parseInt(updates.maxTokens) : null;
    }

    const model = await updateAIModel(id, updates);
    
    // Transform the response to camelCase
    const transformedModel = {
      id: model.id,
      name: model.name,
      provider: model.provider,
      modelId: model.model_id,
      description: model.description,
      capabilities: model.capabilities,
      maxTokens: model.max_tokens,
      active: model.active,
      chatEnabled: model.chat_enabled,
      createdAt: model.created_at,
      updatedAt: model.updated_at
    };

    return NextResponse.json({
      isSuccess: true,
      message: 'Model updated successfully',
      data: transformedModel
    });
  } catch (error) {
    console.error('Error updating model:', error);
    return NextResponse.json(
      { isSuccess: false, message: 'Failed to update model' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    // Check authorization - temporary solution
    const cookieStore = await cookies()
    const hasAuthCookie = cookieStore.has('CognitoIdentityServiceProvider.3409udcdkhvqbs5njab7do8fsr.LastAuthUser')
    
    if (!hasAuthCookie) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // TODO: Implement proper admin check with Amplify

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
    console.error('Error deleting model:', error);
    return NextResponse.json(
      { isSuccess: false, message: 'Failed to delete model' },
      { status: 500 }
    );
  }
} 