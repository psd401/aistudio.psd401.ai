import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/admin-check"
import { upsertSettingAction } from "@/actions/db/settings-actions"
import { withErrorHandling } from "@/lib/api-utils"

// List of settings that can be imported from environment
const IMPORTABLE_SETTINGS = [
  { key: "AZURE_OPENAI_KEY", category: "ai_providers", description: "Azure OpenAI API key for GPT models", isSecret: true },
  { key: "AZURE_OPENAI_ENDPOINT", category: "ai_providers", description: "Azure OpenAI endpoint URL", isSecret: false },
  { key: "AZURE_OPENAI_RESOURCENAME", category: "ai_providers", description: "Azure OpenAI resource name", isSecret: false },
  { key: "BEDROCK_ACCESS_KEY_ID", category: "ai_providers", description: "AWS Bedrock access key ID", isSecret: true },
  { key: "BEDROCK_SECRET_ACCESS_KEY", category: "ai_providers", description: "AWS Bedrock secret access key", isSecret: true },
  { key: "BEDROCK_REGION", category: "ai_providers", description: "AWS Bedrock region (e.g., us-east-1)", isSecret: false },
  { key: "GOOGLE_API_KEY", category: "ai_providers", description: "Google AI API key for Gemini models", isSecret: true },
  { key: "OPENAI_API_KEY", category: "ai_providers", description: "OpenAI API key for GPT models", isSecret: true },
  { key: "LATIMER_API_KEY", category: "ai_providers", description: "Latimer.ai API key", isSecret: true },
  { key: "GOOGLE_VERTEX_PROJECT_ID", category: "ai_providers", description: "Google Cloud project ID for Vertex AI", isSecret: false },
  { key: "GOOGLE_VERTEX_LOCATION", category: "ai_providers", description: "Google Cloud location for Vertex AI", isSecret: false },
  { key: "GOOGLE_APPLICATION_CREDENTIALS", category: "ai_providers", description: "Path to Google Cloud service account credentials JSON", isSecret: true },
  { key: "S3_BUCKET", category: "storage", description: "AWS S3 bucket name for document storage", isSecret: false },
  { key: "AWS_REGION", category: "storage", description: "AWS region for S3 operations", isSecret: false },
  { key: "GITHUB_ISSUE_TOKEN", category: "external_services", description: "GitHub personal access token for creating issues", isSecret: true },
]

// POST /api/admin/settings/import - Import settings from environment variables
export async function POST() {
  return withErrorHandling(async () => {
    // Check admin authorization
    const authError = await requireAdmin();
    if (authError) return authError;

    let imported = 0
    const errors: string[] = []

    for (const setting of IMPORTABLE_SETTINGS) {
      const envValue = process.env[setting.key]
      if (envValue) {
        try {
          await upsertSettingAction({
            key: setting.key,
            value: envValue,
            description: setting.description,
            category: setting.category,
            isSecret: setting.isSecret
          })
          imported++
        } catch (error) {
          errors.push(`Failed to import ${setting.key}: ${error}`)
        }
      }
    }

    return NextResponse.json({
      isSuccess: true,
      message: `Imported ${imported} settings from environment variables`,
      data: { imported, errors }
    })
  }, 'POST /api/admin/settings/import')
}