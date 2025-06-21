import { getServerSession } from '@/lib/auth/server-session';
import { NextResponse } from 'next/server';
import { executeSQL } from '@/lib/db/data-api-adapter';
import { hasRole } from '@/utils/roles';

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

    // Check if the user has already voted
    const existingVoteSql = 'SELECT id FROM idea_votes WHERE idea_id = :ideaId AND user_id = :userId';
    const existingVoteParams = [
      { name: 'ideaId', value: { longValue: ideaId } },
      { name: 'userId', value: { stringValue: session.sub } }
    ];
    const existingVotes = await executeSQL(existingVoteSql, existingVoteParams);

    if (existingVotes.length > 0) {
      // User has voted, so remove the vote (un-vote)
      const deleteVoteSql = 'DELETE FROM idea_votes WHERE id = :voteId';
      await executeSQL(deleteVoteSql, [{ name: 'voteId', value: { longValue: existingVotes[0].id } }]);
      return NextResponse.json({ success: true, message: 'Vote removed' });
    } else {
      // User has not voted, so add the vote
      const addVoteSql = 'INSERT INTO idea_votes (idea_id, user_id, created_at) VALUES (:ideaId, :userId, NOW())';
      await executeSQL(addVoteSql, existingVoteParams);
      return NextResponse.json({ success: true, message: 'Vote recorded' });
    }
  } catch (error) {
    console.error('Error voting on idea:', error);
    return new NextResponse(
      error instanceof Error ? error.message : 'Internal Server Error',
      { status: 500 }
    );
  }
} 