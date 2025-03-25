// This file is deprecated. Import from /db/schema/index.ts instead.
// This helps with the transition to prevent breaking imports

import {
  usersTable as users,
  ideasTable as ideas,
  ideaNotesTable as ideaNotes,
  ideaVotesTable as ideaVotes,
  aiModelsTable as aiModels,
  conversationsTable as conversations,
  messagesTable as messages,
  // Types
  SelectUser as User,
  InsertUser as NewUser,
  SelectIdea as Idea,
  InsertIdea as NewIdea,
  SelectIdeaNote as IdeaNote,
  InsertIdeaNote as NewIdeaNote,
  SelectIdeaVote as IdeaVote,
  InsertIdeaVote as NewIdeaVote,
  SelectAiModel as AiModel,
  InsertAiModel as NewAiModel,
  SelectConversation as Conversation,
  InsertConversation as NewConversation,
  SelectMessage as Message,
  InsertMessage as NewMessage
} from '../db/schema';

export type Role = 'student' | 'staff' | 'administrator';

// Re-export aliased tables and types to maintain compatibility
export {
  users,
  ideas,
  ideaNotes,
  ideaVotes,
  aiModels,
  conversations,
  messages,
  // Types
  User,
  NewUser,
  Idea,
  NewIdea,
  IdeaNote,
  NewIdeaNote,
  IdeaVote,
  NewIdeaVote,
  AiModel,
  NewAiModel,
  Conversation,
  NewConversation,
  Message,
  NewMessage
}; 