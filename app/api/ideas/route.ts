import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { db } from '@/db/db';
import { ideasTable, ideaVotesTable, ideaNotesTable } from '@/db/schema';
import { desc, eq, and, sql } from 'drizzle-orm';
import { hasRole } from '@/utils/roles';

export async function GET() {
  // Protect route from unauthenticated users
  const { userId } = await auth.protect();

  try {
    // Get all ideas with vote counts and note counts
    const allIdeas = await db
      .select({
        ...ideasTable,
        voteCount: sql<number>`count(distinct ${ideaVotesTable.id})::int`,
        noteCount: sql<number>`count(distinct ${ideaNotesTable.id})::int`
      })
      .from(ideasTable)
      .leftJoin(ideaVotesTable, eq(ideasTable.id, ideaVotesTable.ideaId))
      .leftJoin(ideaNotesTable, eq(ideasTable.id, ideaNotesTable.ideaId))
      .groupBy(ideasTable.id)
      .orderBy(desc(ideasTable.createdAt));

    // Get all votes for the current user
    const userVotes = await db.select()
      .from(ideaVotesTable)
      .where(eq(ideaVotesTable.userId, userId));

    // Add hasVoted flag to each idea
    const ideasWithVotes = allIdeas.map(idea => ({
      ...idea,
      votes: idea.voteCount,
      notes: idea.noteCount,
      hasVoted: userVotes.some(vote => vote.ideaId === idea.id)
    }));

    return NextResponse.json(ideasWithVotes);
  } catch (error) {
    console.error('Error fetching ideas:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

export async function POST(request: Request) {
  // Protect route from unauthenticated users
  const { userId } = await auth.protect();

  // Only staff or admin can create ideas
  const [isStaff, isAdmin] = await Promise.all([
    hasRole(userId, 'staff'),
    hasRole(userId, 'administrator')
  ]);
  if (!isStaff && !isAdmin) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  try {
    const { title, description, priorityLevel } = await request.json();
    if (!title || !description || !priorityLevel) {
      return new NextResponse('Missing required fields', { status: 400 });
    }

    const [newIdea] = await db.insert(ideasTable).values({
      title,
      description,
      priorityLevel,
      status: 'active',
      createdBy: userId,
      createdAt: new Date()
    }).returning();

    return NextResponse.json(newIdea);
  } catch (error) {
    console.error('Error creating idea:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 