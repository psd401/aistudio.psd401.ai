"use server"

import { redirect } from "next/navigation"
import { CreateForm } from "./_components/create-form"
import { CreateLayout } from "./_components/create-layout"

export default async function CreateAssistantPage() {
  // Remove Clerk imports and logic. If you need to check if a user is signed in or get user info, use getCurrentUser from aws-amplify/auth in a useEffect and state.

  return (
    <CreateLayout currentStep={1} title="Create Assistant">
      <CreateForm />
    </CreateLayout>
  )
} 