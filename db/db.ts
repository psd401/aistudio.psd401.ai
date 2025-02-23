import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import {
  // Communication Analysis Schema
  communicationSettingsTable,
  audiencesTable,
  analysisPromptsTable,
  analysisResultsTable,
  accessControlTable,
  audienceConfigsTable,
  // Core Schema
  usersTable,
  ideasTable,
  ideaNotesTable,
  ideaVotesTable,
  aiModelsTable,
  conversationsTable,
  messagesTable
} from "./schema"

if (!process.env.DATABASE_URL) {
  throw new Error("Missing env.DATABASE_URL")
}

const client = postgres(process.env.DATABASE_URL)

export const db = drizzle(client, {
  schema: {
    // Communication Analysis Schema
    communicationSettings: communicationSettingsTable,
    communicationAudiences: audiencesTable,
    analysisPrompts: analysisPromptsTable,
    analysisResults: analysisResultsTable,
    accessControl: accessControlTable,
    communicationAudienceConfigs: audienceConfigsTable,
    // Core Schema
    users: usersTable,
    ideas: ideasTable,
    ideaNotes: ideaNotesTable,
    ideaVotes: ideaVotesTable,
    aiModels: aiModelsTable,
    conversations: conversationsTable,
    messages: messagesTable
  }
}) 