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
      modelId: model.model_id,
      description: model.description,
      isActive: model.active,  // Changed from is_active to active
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
      description: body.description,
      isActive: body.isActive ?? true
    };

    const model = await createAIModel(modelData);

    return NextResponse.json({
      isSuccess: true,
      message: 'Model created successfully',
      data: model
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

    const model = await updateAIModel(id, updates);

    return NextResponse.json({
      isSuccess: true,
      message: 'Model updated successfully',
      data: model
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