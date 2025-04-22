"use server"

import { getRulesAction } from "@/actions/db/rules-actions"
import { RulesPageClient } from "./_components/rules-page-client"

interface RulesPageProps {
  params: {
    id: string
  }
}

export default async function RulesPage({ params }: RulesPageProps) {
  const { data: rules } = await getRulesAction(params.id)

  return <RulesPageClient assistantId={params.id} rules={rules || []} />
} 