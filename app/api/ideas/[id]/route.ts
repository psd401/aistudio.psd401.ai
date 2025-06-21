import { NextResponse, NextRequest } from 'next/server';
import { getServerSession } from '@/lib/auth/server-session';
import { executeSQL } from '@/lib/db/data-api-adapter';
import { hasRole } from '@/utils/roles';

export async function PATCH(
  request: NextRequest,
  context: { params: { id: string } }
) {
  const session = await getServerSession();
  if (!session?.sub) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [isStaff, isAdmin] = await Promise.all([
    hasRole('staff'),
    hasRole('administrator')
  ]);
  if (!isStaff && !isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  
  try {
    const body = await request.json();
    const { id } = await Promise.resolve(context.params);

    const updateFields: string[] = [];
    const params: any[] = [{ name: 'id', value: { longValue: parseInt(id) } }];

    if (body.title) {
      updateFields.push('title = :title');
      params.push({ name: 'title', value: { stringValue: body.title } });
    }
    if (body.description) {
      updateFields.push('description = :description');
      params.push({ name: 'description', value: { stringValue: body.description } });
    }
    if (body.priorityLevel) {
      updateFields.push('priority_level = :priorityLevel');
      params.push({ name: 'priorityLevel', value: { stringValue: body.priorityLevel } });
    }
    if (body.status) {
      updateFields.push('status = :status');
      params.push({ name: 'status', value: { stringValue: body.status } });
      if (body.status === 'completed') {
        updateFields.push('completed_by = :completedBy', 'completed_at = NOW()');
        params.push({ name: 'completedBy', value: { stringValue: session.sub } });
      }
    }

    if (updateFields.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const sql = `
      UPDATE ideas
      SET ${updateFields.join(', ')}, updated_at = NOW()
      WHERE id = :id
      RETURNING *
    `;
    
    const result = await executeSQL(sql, params);
    return NextResponse.json(result[0]);
  } catch (error) {
    console.error('Failed to update idea:', error);
    return NextResponse.json({ error: 'Failed to update idea' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: { id: string } }
) {
  const session = await getServerSession();
  if (!session?.sub) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const isAdmin = await hasRole('administrator');
  if (!isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { id } = await Promise.resolve(context.params);
    const sql = 'DELETE FROM ideas WHERE id = :id';
    await executeSQL(sql, [{ name: 'id', value: { longValue: parseInt(id) } }]);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Failed to delete idea:', error);
    return NextResponse.json({ error: 'Failed to delete idea' }, { status: 500 });
  }
} 