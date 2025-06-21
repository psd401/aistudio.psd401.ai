import { getServerSession } from '@/lib/auth/server-session';
import { NextResponse } from 'next/server';
import { executeSQL } from '@/lib/db/data-api-adapter';
import { hasRole } from '@/utils/roles';

export async function GET(request: Request, context: { params: { id: string } }) {
  const session = await getServerSession();
  if (!session?.sub) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    const { id } = await Promise.resolve(context.params);
    const ideaId = parseInt(id);
    if (isNaN(ideaId)) {
      return new NextResponse('Invalid idea ID', { status: 400 });
    }

    const sql = 'SELECT * FROM idea_notes WHERE idea_id = :ideaId ORDER BY created_at ASC';
    const notes = await executeSQL(sql, [{ name: 'ideaId', value: { longValue: ideaId } }]);

    return NextResponse.json(notes.map((note: any) => ({
      ...note,
      createdBy: note.created_by,
      createdAt: note.created_at,
    })));
  } catch (error) {
    console.error('Error fetching notes:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

export async function POST(request: Request, context: { params: { id: string } }) {
  const session = await getServerSession();
  if (!session?.sub) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const [isStaff, isAdmin] = await Promise.all([
    hasRole('staff'),
    hasRole('administrator')
  ]);
  if (!isStaff && !isAdmin) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  try {
    const { id } = await Promise.resolve(context.params);
    const ideaId = parseInt(id);
    if (isNaN(ideaId)) {
      return new NextResponse('Invalid idea ID', { status: 400 });
    }

    const { content } = await request.json();
    if (!content) {
      return new NextResponse('Missing content', { status: 400 });
    }

    const sql = `
      INSERT INTO idea_notes (idea_id, content, created_by, created_at)
      VALUES (:ideaId, :content, :createdBy, NOW())
      RETURNING *
    `;
    const params = [
      { name: 'ideaId', value: { longValue: ideaId } },
      { name: 'content', value: { stringValue: content } },
      { name: 'createdBy', value: { stringValue: session.sub } }
    ];
    const result = await executeSQL(sql, params);
    const newNote = result[0];

    return NextResponse.json({
      ...newNote,
      createdBy: newNote.created_by,
      createdAt: newNote.created_at,
    });
  } catch (error) {
    console.error('Error creating note:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 