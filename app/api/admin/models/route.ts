import { NextResponse } from 'next/server';
import { db } from '~/lib/db';
import { aiModels } from '~/lib/schema';
import { eq } from 'drizzle-orm';
import { getAuth } from '@clerk/nextjs/server';
import { hasRole } from '~/utils/roles';

export async function GET(request: Request) {
  try {
    const { userId } = getAuth(request);
    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const isAdmin = await hasRole(userId, 'administrator');
    if (!isAdmin) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    const models = await db.select().from(aiModels).orderBy(aiModels.name);
    return NextResponse.json(models);
  } catch (error) {
    console.error('Error fetching AI models:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = getAuth(request);
    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const isAdmin = await hasRole(userId, 'Admin');
    if (!isAdmin) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    const body = await request.json();
    console.log('Received POST request with body:', body);

    // Validate required fields
    if (!body.name?.trim()) {
      return new NextResponse('Name is required', { status: 400 });
    }
    if (!body.provider?.trim()) {
      return new NextResponse('Provider is required', { status: 400 });
    }
    if (!body.modelId?.trim()) {
      return new NextResponse('Model ID is required', { status: 400 });
    }

    // Validate provider value
    const validProviders = ['azure', 'amazon-bedrock', 'google'];
    if (!validProviders.includes(body.provider)) {
      return new NextResponse('Invalid provider', { status: 400 });
    }

    // Validate capabilities JSON if present
    if (body.capabilities) {
      try {
        JSON.parse(body.capabilities);
      } catch (e) {
        return new NextResponse('Invalid JSON in capabilities field', { status: 400 });
      }
    }

    // Clean up the data before insertion
    const modelData = {
      name: body.name.trim(),
      provider: body.provider,
      modelId: body.modelId.trim(),
      description: body.description?.trim() || null,
      capabilities: body.capabilities || null,
      maxTokens: typeof body.maxTokens === 'number' ? body.maxTokens : null,
      active: body.active ?? true,
    };

    console.log('Attempting to insert model with data:', modelData);
    const [model] = await db.insert(aiModels)
      .values(modelData)
      .returning();

    console.log('Successfully created model:', model);
    return NextResponse.json(model);
  } catch (error) {
    console.error('Error creating AI model:', error);
    return new NextResponse(
      error instanceof Error ? error.message : 'Internal Server Error', 
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const { userId } = getAuth(request);
    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const isAdmin = await hasRole(userId, 'Admin');
    if (!isAdmin) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    const body = await request.json();
    console.log('Received PUT request with body:', body);

    if (!body.id) {
      return new NextResponse('Model ID is required', { status: 400 });
    }

    // Validate provider if it's being updated
    if (body.provider) {
      const validProviders = ['azure', 'amazon-bedrock', 'google'];
      if (!validProviders.includes(body.provider)) {
        return new NextResponse('Invalid provider', { status: 400 });
      }
    }

    // Validate capabilities JSON if it's being updated
    if (body.capabilities) {
      try {
        JSON.parse(body.capabilities);
      } catch (e) {
        return new NextResponse('Invalid JSON in capabilities field', { status: 400 });
      }
    }

    // Clean up the update data
    const updates = {
      ...(body.name && { name: body.name.trim() }),
      ...(body.provider && { provider: body.provider }),
      ...(body.modelId && { modelId: body.modelId.trim() }),
      ...(body.description !== undefined && { description: body.description?.trim() || null }),
      ...(body.capabilities !== undefined && { capabilities: body.capabilities || null }),
      ...(body.maxTokens !== undefined && { maxTokens: body.maxTokens }),
      ...(body.active !== undefined && { active: body.active }),
      updatedAt: new Date(),
    };

    console.log('Attempting to update model with data:', updates);
    const [model] = await db.update(aiModels)
      .set(updates)
      .where(eq(aiModels.id, body.id))
      .returning();

    if (!model) {
      return new NextResponse('Model not found', { status: 404 });
    }

    console.log('Successfully updated model:', model);
    return NextResponse.json(model);
  } catch (error) {
    console.error('Error updating AI model:', error);
    return new NextResponse(
      error instanceof Error ? error.message : 'Internal Server Error', 
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { userId } = getAuth(request);
    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const isAdmin = await hasRole(userId, 'Admin');
    if (!isAdmin) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return new NextResponse('Model ID is required', { status: 400 });
    }

    console.log('Attempting to delete model:', id);
    const [deletedModel] = await db.delete(aiModels)
      .where(eq(aiModels.id, parseInt(id)))
      .returning();

    if (!deletedModel) {
      return new NextResponse('Model not found', { status: 404 });
    }

    console.log('Successfully deleted model:', deletedModel);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Error deleting AI model:', error);
    return new NextResponse(
      error instanceof Error ? error.message : 'Internal Server Error', 
      { status: 500 }
    );
  }
} 