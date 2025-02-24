import { NextRequest, NextResponse } from "next/server"
import { generateMetaPrompt, type MetaPromptingConfig } from "@/lib/meta-prompting-helpers"

export async function POST(request: NextRequest) {
  try {
    const { config, input } = await request.json()

    if (!config || !input) {
      return NextResponse.json({
        isSuccess: false,
        message: "Missing required parameters"
      })
    }

    const result = await generateMetaPrompt(config as MetaPromptingConfig, input)

    return NextResponse.json({
      isSuccess: true,
      message: "Meta-prompt generated successfully",
      data: result
    })
  } catch (error) {
    console.error("Error generating meta-prompt:", error)
    return NextResponse.json({
      isSuccess: false,
      message: "Failed to generate meta-prompt"
    })
  }
} 