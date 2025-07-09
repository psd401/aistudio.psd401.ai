import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/server-session';
import { executeSQL } from '@/lib/db/data-api-adapter';
import { hasRole } from '@/utils/roles';
import logger from '@/lib/logger';

export async function GET() {
  const session = await getServerSession();
  if (!session?.sub) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    const ideasSql = `
      SELECT 
        i.*,
        COALESCE(
          TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))),
          u.email,
          i.user_id
        ) as creator_name,
        COALESCE(
          TRIM(CONCAT(COALESCE(cu.first_name, ''), ' ', COALESCE(cu.last_name, ''))),
          cu.email,
          i.completed_by
        ) as completed_by_name,
        COUNT(DISTINCT v.id)::int as votes,
        COUNT(DISTINCT n.id)::int as notes
      FROM ideas i
      LEFT JOIN users u ON i.user_id = u.id::text
      LEFT JOIN users cu ON i.completed_by = cu.id::text
      LEFT JOIN idea_votes v ON i.id = v.idea_id
      LEFT JOIN idea_notes n ON i.id = n.idea_id
      GROUP BY i.id, u.first_name, u.last_name, u.email, cu.first_name, cu.last_name, cu.email
      ORDER BY i.created_at DESC
    `;
    const allIdeas = await executeSQL(ideasSql);

    // Get the user's numeric ID for vote checking
    const userIdSql = 'SELECT id FROM users WHERE cognito_sub = :cognitoSub';
    const userIdResult = await executeSQL(userIdSql, [{ name: 'cognitoSub', value: { stringValue: session.sub } }]);
    const currentUserId = userIdResult && userIdResult.length > 0 ? userIdResult[0].id : null;
    
    let userVotedIdeaIds = new Set();
    if (currentUserId) {
      const userVotesSql = 'SELECT idea_id FROM idea_votes WHERE user_id = :userId';
      const userVotes = await executeSQL(userVotesSql, [{ name: 'userId', value: { stringValue: currentUserId.toString() } }]);
      userVotedIdeaIds = new Set(userVotes.map((vote: any) => vote.idea_id));
    }

    const ideasWithVotes = allIdeas.map((idea: any) => ({
      ...idea,
      priorityLevel: idea.priority_level,
      createdBy: idea.creator_name || idea.user_id,
      createdAt: idea.created_at,
      updatedAt: idea.updated_at,
      completedAt: idea.completed_at,
      completedBy: idea.completed_by_name || idea.completed_by,
      hasVoted: userVotedIdeaIds.has(idea.id)
    }));
    
    return NextResponse.json(ideasWithVotes);
  } catch (error) {
    logger.error('Error fetching ideas:', error);
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

    // First get the user's numeric ID from their cognito_sub
    const userSql = 'SELECT id FROM users WHERE cognito_sub = :cognitoSub';
    const userResult = await executeSQL(userSql, [{ name: 'cognitoSub', value: { stringValue: session.sub } }]);
    
    if (!userResult || userResult.length === 0) {
      return new NextResponse('User not found', { status: 404 });
    }
    
    const userId = userResult[0].id;

    const sql = `
      INSERT INTO ideas (title, description, priority_level, status, user_id, created_at)
      VALUES (:title, :description, :priorityLevel, 'active', :userId, NOW())
      RETURNING *
    `;
    const params = [
      { name: 'title', value: { stringValue: title } },
      { name: 'description', value: { stringValue: description } },
      { name: 'priorityLevel', value: { stringValue: priorityLevel } },
      { name: 'userId', value: { stringValue: userId.toString() } }
    ];
    const result = await executeSQL(sql, params);
    const newIdea = result[0];

    return NextResponse.json({
      ...newIdea,
      priorityLevel: newIdea.priority_level,
      createdBy: newIdea.user_id,
      createdAt: newIdea.created_at
    });
  } catch (error) {
    logger.error('Error creating idea:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 