"use client"

import { AssistantArchitectForm } from "@/components/features/assistant-architect/assistant-architect-form"
import { useRouter } from "next/navigation"

export default function CreateForm() {
  const router = useRouter()
  
  return (
    <AssistantArchitectForm 
      onSuccess={(newToolId) => {
        router.push(`/utilities/assistant-architect/${newToolId}`)
      }}
    />
  )
} 