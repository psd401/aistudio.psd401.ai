import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/server-session';
import { executeSQL } from '@/lib/db/data-api-adapter';
import { hasRole } from '@/utils/roles';
import { createLogger, generateRequestId, startTimer } from '@/lib/logger';

export async function GET() {
  const requestId = generateRequestId();
  const timer = startTimer("api.ideas.list");
  const log = createLogger({ requestId, route: "api.ideas" });
  
  log.info("GET /api/ideas - Fetching ideas");
  
  const session = await getServerSession();
  if (!session?.sub) {
    log.warn("Unauthorized access attempt to ideas");
    timer({ status: "error", reason: "unauthorized" });
    return new NextResponse('Unauthorized', { 
      status: 401,
      headers: { "X-Request-Id": requestId }
    });
  }
  
  log.debug("User authenticated", { userId: session.sub });

  try {
    const ideasSql = `
      SELECT 
        i.*,
        COALESCE(
          TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))),
          u.email,
          i.user_id::text
        ) as creator_name,
        COALESCE(
          TRIM(CONCAT(COALESCE(cu.first_name, ''), ' ', COALESCE(cu.last_name, ''))),
          cu.email,
          i.completed_by
        ) as completed_by_name,
        COUNT(DISTINCT v.id)::int as votes,
        COUNT(DISTINCT n.id)::int as notes
      FROM ideas i
      LEFT JOIN users u ON i.user_id = u.id
      LEFT JOIN users cu ON (
        CASE 
          WHEN i.completed_by ~ '^[0-9]+$' THEN i.completed_by::integer = cu.id
          ELSE cu.old_clerk_id = i.completed_by
        END
      )
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
      const userVotes = await executeSQL(userVotesSql, [{ name: 'userId', value: { longValue: Number(currentUserId) } }]);
      userVotedIdeaIds = new Set(userVotes.map((vote) => Number(vote.ideaId)));
    }


    const ideasWithVotes = allIdeas.map((idea) => ({
      ...idea,
      hasVoted: userVotedIdeaIds.has(idea.id)
    }));
    
    log.info("Ideas retrieved successfully", { count: ideasWithVotes.length });
    timer({ status: "success", count: ideasWithVotes.length });
    
    return NextResponse.json(ideasWithVotes, {
      headers: { "X-Request-Id": requestId }
    });
  } catch (error) {
    timer({ status: "error" });
    log.error('Error fetching ideas:', error);
    return new NextResponse('Internal Server Error', { 
      status: 500,
      headers: { "X-Request-Id": requestId }
    });
  }
}

export async function POST(request: Request) {
  const requestId = generateRequestId();
  const timer = startTimer("api.ideas.create");
  const log = createLogger({ requestId, route: "api.ideas" });
  
  log.info("POST /api/ideas - Creating new idea");
  
  const session = await getServerSession();
  if (!session?.sub) {
    log.warn("Unauthorized idea creation attempt");
    timer({ status: "error", reason: "unauthorized" });
    return new NextResponse('Unauthorized', { 
      status: 401,
      headers: { "X-Request-Id": requestId }
    });
  }
  
  log.debug("User authenticated", { userId: session.sub });

  const [isStaff, isAdmin] = await Promise.all([
    hasRole('staff'),
    hasRole('administrator')
  ]);
  if (!isStaff && !isAdmin) {
    log.warn("Insufficient permissions to create idea", { userId: session.sub });
    timer({ status: "error", reason: "forbidden" });
    return new NextResponse('Forbidden', { 
      status: 403,
      headers: { "X-Request-Id": requestId }
    });
  }

  try {
    const { title, description, priorityLevel } = await request.json();
    
    log.debug("Creating idea", { title, priorityLevel });
    
    if (!title || !description || !priorityLevel) {
      log.warn("Missing required fields for idea creation");
      timer({ status: "error", reason: "validation_error" });
      return new NextResponse('Missing required fields', { 
        status: 400,
        headers: { "X-Request-Id": requestId }
      });
    }

    // First get the user's numeric ID from their cognito_sub
    const userSql = 'SELECT id FROM users WHERE cognito_sub = :cognitoSub';
    const userResult = await executeSQL(userSql, [{ name: 'cognitoSub', value: { stringValue: session.sub } }]);
    
    if (!userResult || userResult.length === 0) {
      log.error("User not found in database", { cognitoSub: session.sub });
      timer({ status: "error", reason: "user_not_found" });
      return new NextResponse('User not found', { 
        status: 404,
        headers: { "X-Request-Id": requestId }
      });
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
      { name: 'userId', value: { longValue: Number(userId) } }
    ];
    const result = await executeSQL(sql, params);
    const newIdea = result[0];

    // The data is already converted to camelCase by formatDataApiResponse
    log.info("Idea created successfully", { ideaId: newIdea.id });
    timer({ status: "success" });
    
    return NextResponse.json(
      {
        ...newIdea,
        createdBy: String(newIdea.userId)
      },
      { headers: { "X-Request-Id": requestId } }
    );
  } catch (error) {
    timer({ status: "error" });
    log.error('Error creating idea:', error);
    return new NextResponse('Internal Server Error', { 
      status: 500,
      headers: { "X-Request-Id": requestId }
    });
  }
} 