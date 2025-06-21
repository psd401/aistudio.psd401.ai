import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/server-session';
import { executeSQL } from '@/lib/db/data-api-adapter';
import { ideasTable, ideaVotesTable, ideaNotesTable } from '@/db/schema';
import { desc, eq, and, sql } from 'drizzle-orm';
import { hasRole } from '@/utils/roles';

export async function GET() {
  const session = await getServerSession();
  if (!session?.sub) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    const ideasSql = `
      SELECT 
        i.*,
        COUNT(DISTINCT v.id)::int as votes,
        COUNT(DISTINCT n.id)::int as notes
      FROM ideas i
      LEFT JOIN idea_votes v ON i.id = v.idea_id
      LEFT JOIN idea_notes n ON i.id = n.idea_id
      GROUP BY i.id
      ORDER BY i.created_at DESC
    `;
    const allIdeas = await executeSQL(ideasSql);

    const userVotesSql = 'SELECT idea_id FROM idea_votes WHERE user_id = :userId';
    const userVotes = await executeSQL(userVotesSql, [{ name: 'userId', value: { stringValue: session.sub } }]);
    const userVotedIdeaIds = new Set(userVotes.map((vote: any) => vote.idea_id));

    const ideasWithVotes = allIdeas.map((idea: any) => ({
      ...idea,
      priorityLevel: idea.priority_level,
      createdBy: idea.created_by,
      createdAt: idea.created_at,
      updatedAt: idea.updated_at,
      completedAt: idea.completed_at,
      completedBy: idea.completed_by,
      hasVoted: userVotedIdeaIds.has(idea.id)
    }));
    
    return NextResponse.json(ideasWithVotes);
  } catch (error) {
    console.error('Error fetching ideas:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

export async function POST(request: Request) {
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
    const { title, description, priorityLevel } = await request.json();
    if (!title || !description || !priorityLevel) {
      return new NextResponse('Missing required fields', { status: 400 });
    }

    const sql = `
      INSERT INTO ideas (title, description, priority_level, status, created_by, created_at)
      VALUES (:title, :description, :priorityLevel, 'active', :createdBy, NOW())
      RETURNING *
    `;
    const params = [
      { name: 'title', value: { stringValue: title } },
      { name: 'description', value: { stringValue: description } },
      { name: 'priorityLevel', value: { stringValue: priorityLevel } },
      { name: 'createdBy', value: { stringValue: session.sub } }
    ];
    const result = await executeSQL(sql, params);
    const newIdea = result[0];

    return NextResponse.json({
      ...newIdea,
      priorityLevel: newIdea.priority_level,
      createdBy: newIdea.created_by,
      createdAt: newIdea.created_at
    });
  } catch (error) {
    console.error('Error creating idea:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 