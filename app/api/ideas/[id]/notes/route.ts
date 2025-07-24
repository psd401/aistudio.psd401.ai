import { getServerSession } from '@/lib/auth/server-session';
import { NextResponse } from 'next/server';
import { executeSQL, FormattedRow } from '@/lib/db/data-api-adapter';
import { hasRole } from '@/utils/roles';
import logger from '@/lib/logger';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  if (!session?.sub) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;
    const ideaId = parseInt(id);
    if (isNaN(ideaId)) {
      return new NextResponse('Invalid idea ID', { status: 400 });
    }

    const sql = `
      SELECT 
        n.*,
        COALESCE(
          TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))),
          u.email,
          n.user_id::text
        ) as creator_name
      FROM idea_notes n
      LEFT JOIN users u ON n.user_id = u.id
      WHERE n.idea_id = :ideaId
      ORDER BY n.created_at ASC
    `;
    const notes = await executeSQL<FormattedRow>(sql, [{ name: 'ideaId', value: { longValue: ideaId } }]);

    return NextResponse.json(notes.map((note) => ({
      ...note,
      createdBy: note.creator_name || note.user_id,
      createdAt: note.created_at,
    })));
  } catch (error) {
    logger.error('Error fetching notes:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
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
    const resolvedParams = await context.params;
    const { id } = resolvedParams;
    const ideaId = parseInt(id);
    if (isNaN(ideaId)) {
      return new NextResponse('Invalid idea ID', { status: 400 });
    }

    const { content } = await request.json();
    if (!content) {
      return new NextResponse('Missing content', { status: 400 });
    }

    // First get the user's numeric ID from their cognito_sub
    const userSql = 'SELECT id FROM users WHERE cognito_sub = :cognitoSub';
    const userResult = await executeSQL(userSql, [{ name: 'cognitoSub', value: { stringValue: session.sub } }]);
    
    if (!userResult || userResult.length === 0) {
      return new NextResponse('User not found', { status: 404 });
    }
    
    const userId = userResult[0].id;

    const sql = `
      INSERT INTO idea_notes (idea_id, content, user_id, created_at)
      VALUES (:ideaId, :content, :userId, NOW())
      RETURNING *
    `;
    const params = [
      { name: 'ideaId', value: { longValue: ideaId } },
      { name: 'content', value: { stringValue: content } },
      { name: 'userId', value: { longValue: userId } }
    ];
    const result = await executeSQL(sql, params);
    const newNote = result[0];

    return NextResponse.json({
      ...newNote,
      createdBy: newNote.user_id,
      createdAt: newNote.created_at,
    });
  } catch (error) {
    logger.error('Error creating note:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 