import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { db } from '@/db/db';
import { ideasTable, ideaVotesTable } from '@/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { hasRole } from '@/utils/roles';

export async function POST(request: Request, context: { params: { id: string } }) {
  console.log('Vote route called with params:', context.params);
  
  // Protect route from unauthenticated users
  const { userId } = await auth.protect();
  console.log('Authenticated userId:', userId);

  // Only staff or admin can vote
  const [isStaff, isAdmin] = await Promise.all([
    hasRole(userId, 'staff'),
    hasRole(userId, 'administrator')
  ]);
  console.log('Role check:', { isStaff, isAdmin });
  
  if (!isStaff && !isAdmin) {
    console.log('User not authorized to vote');
    return new NextResponse('Forbidden', { status: 403 });
  }

  try {
    const { id } = await Promise.resolve(context.params);
    const ideaId = parseInt(id);
    console.log('Processing vote for ideaId:', ideaId);
    
    if (isNaN(ideaId)) {
      console.log('Invalid idea ID:', id);
      return new NextResponse('Invalid idea ID', { status: 400 });
    }

    // First check if the idea exists
    const idea = await db.select()
      .from(ideasTable)
      .where(eq(ideasTable.id, ideaId))
      .limit(1);
    console.log('Found idea:', idea);

    if (idea.length === 0) {
      console.log('Idea not found for id:', ideaId);
      return new NextResponse('Idea not found', { status: 404 });
    }

    // Check if user has already voted
    const existingVote = await db.select()
      .from(ideaVotesTable)
      .where(and(
        eq(ideaVotesTable.ideaId, ideaId),
        eq(ideaVotesTable.userId, userId)
      ))
      .limit(1);
    console.log('Existing vote check:', existingVote);

    if (existingVote.length > 0) {
      console.log('User has already voted');
      return new NextResponse('You have already voted on this idea', { status: 400 });
    }

    // Create vote and increment vote count in a transaction
    console.log('Starting vote transaction');
    await db.transaction(async (tx) => {
      // Create vote
      await tx.insert(ideaVotesTable).values({
        ideaId,
        userId,
        createdAt: new Date()
      });
      console.log('Vote inserted');

      // Increment vote count
      await tx.update(ideasTable)
        .set({ votes: sql`${ideasTable.votes} + 1` })
        .where(eq(ideasTable.id, ideaId));
      console.log('Vote count incremented');
    });

    // Get updated idea with new vote count
    const [updatedIdea] = await db.select()
      .from(ideasTable)
      .where(eq(ideasTable.id, ideaId))
      .limit(1);
    console.log('Updated idea:', updatedIdea);

    return NextResponse.json(updatedIdea);
  } catch (error) {
    console.error('Error voting on idea:', error);
    return new NextResponse(
      error instanceof Error ? error.message : 'Internal Server Error',
      { status: 500 }
    );
  }
} 