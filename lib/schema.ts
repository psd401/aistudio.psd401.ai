// This file is deprecated - Please use @/db/schema instead
import {
  usersTable,
  ideaNotesTable,
  ideasTable,
  conversationsTable,
  messagesTable,
  // Types
  type SelectUser,
  type InsertUser,
  type SelectIdea,
  type InsertIdea,
  type SelectIdeaNote,
  type InsertIdeaNote,
  type SelectConversation,
  type InsertConversation,
  type SelectMessage,
  type InsertMessage
} from '@/db/schema';

// Export tables for backward compatibility
export const users = usersTable;
export const ideas = ideasTable;
export const ideaNotes = ideaNotesTable;
export const conversations = conversationsTable;
export const messages = messagesTable;

// Export types for backward compatibility
export type User = SelectUser;
export type NewUser = InsertUser;
export type Idea = SelectIdea;
export type NewIdea = InsertIdea;
export type IdeaNote = SelectIdeaNote;
export type NewIdeaNote = InsertIdeaNote;
export type Conversation = SelectConversation;
export type NewConversation = InsertConversation;
export type Message = SelectMessage;
export type NewMessage = InsertMessage; 