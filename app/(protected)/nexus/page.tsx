'use client'

import { AssistantRuntimeProvider } from '@assistant-ui/react'
import { useAISDKRuntime } from '@assistant-ui/react-ai-sdk'
import { useChat } from '@ai-sdk/react'
import { NexusShell } from './_components/layout/nexus-shell'
import { NexusThread } from './_components/chat/nexus-thread'

export default function NexusPage() {
  const chat = useChat()
  
  const runtime = useAISDKRuntime(chat)
  
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <NexusShell>
        <NexusThread className="h-full" />
      </NexusShell>
    </AssistantRuntimeProvider>
  )
}