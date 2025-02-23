"use server"

import { getAudiencesAction } from "@/actions/db/communication-analysis-actions"
import AudienceManager from "./audience-manager"

export default async function AudienceManagerServer() {
  const result = await getAudiencesAction()
  
  if (!result.isSuccess) {
    throw new Error(result.message)
  }

  return <AudienceManager initialAudiences={result.data} />
} 