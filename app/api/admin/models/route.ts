import { NextResponse } from 'next/server';
import { db } from '@/db/db';
import { aiModelsTable } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';
import { getAuth } from '@clerk/nextjs/server';
import { hasRole } from '~/utils/roles';
import type { InsertAiModel } from '@/types';

export async function GET() {
  try {
    const models = await db
      .select()
      .from(aiModelsTable)
      .orderBy(asc(aiModelsTable.name));

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
    const { userId } = getAuth(request);
    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const isAdmin = await hasRole(userId, 'administrator');
    if (!isAdmin) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    const body = await request.json();
    const modelData: InsertAiModel = {
      ...body,
      capabilities: body.capabilities ? JSON.stringify(body.capabilities) : null,
    };

    const [model] = await db.insert(aiModelsTable).values(modelData).returning();

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
    const { userId } = getAuth(request);
    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const isAdmin = await hasRole(userId, 'administrator');
    if (!isAdmin) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    const body = await request.json();
    const { id, ...updates } = body;

    if (updates.capabilities) {
      updates.capabilities = JSON.stringify(updates.capabilities);
    }

    const [model] = await db
      .update(aiModelsTable)
      .set(updates)
      .where(eq(aiModelsTable.id, id))
      .returning();

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
    const { userId } = getAuth(request);
    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const isAdmin = await hasRole(userId, 'administrator');
    if (!isAdmin) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { isSuccess: false, message: 'Missing model ID' },
        { status: 400 }
      );
    }

    const [model] = await db
      .delete(aiModelsTable)
      .where(eq(aiModelsTable.id, parseInt(id)))
      .returning();

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