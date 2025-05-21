"use server"

import { ActionState } from "@/types"

interface CreateGithubIssueInput {
  title: string
  description: string
}

export async function createGithubIssueAction({ title, description }: CreateGithubIssueInput): Promise<ActionState<{ html_url: string }>> {
  try {
    const token = process.env.GITHUB_ISSUE_TOKEN
    if (!token) {
      return { isSuccess: false, message: "GitHub token not configured" }
    }
    const res = await fetch("https://api.github.com/repos/psd401/aistudio.psd401.ai/issues", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        title,
        body: description,
        labels: ["user-submitted"]
      })
    })
    if (!res.ok) {
      const error = await res.json().catch(() => ({}))
      return { isSuccess: false, message: error.message || "Failed to create GitHub issue" }
    }
    const data = await res.json()
    return { isSuccess: true, message: "Issue created", data: { html_url: data.html_url } }
  } catch (error) {
    return { isSuccess: false, message: "Unexpected error creating GitHub issue", error }
  }
} 