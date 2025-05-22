import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db/db'
import { aiModelsTable, SelectAiModel } from '@/db/schema/core-schema'
import { eq } from 'drizzle-orm'
import { generateCompletion } from '@/lib/ai-helpers'

// Easily change the model id here
const PDF_TO_MARKDOWN_MODEL_ID = 20

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    // Parse multipart form data
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 })
    }
    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Only PDF files are supported.' }, { status: 400 })
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size exceeds 10MB limit.' }, { status: 400 })
    }

    // Get model config from DB
    const [model]: SelectAiModel[] = await db
      .select()
      .from(aiModelsTable)
      .where(eq(aiModelsTable.id, PDF_TO_MARKDOWN_MODEL_ID))
    if (!model) {
      return NextResponse.json({ error: 'AI model not found.' }, { status: 500 })
    }

    // Read file as Buffer
    const arrayBuffer = await file.arrayBuffer()
    const pdfBuffer = Buffer.from(arrayBuffer)

    // System prompt for the LLM
    const systemPrompt = `You are an expert document parser. Given a PDF file, extract ALL text and describe every image or graphic in context. Return a single, well-structured markdown document that preserves the logical order and hierarchy of the original. For images/graphics, insert a markdown image block with a description, e.g. ![Description of image]. Do not skip any content. Output only markdown.`

    // Prepare messages for the LLM (multimodal)
    const messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: systemPrompt },
          { type: 'file', data: pdfBuffer, mimeType: 'application/pdf' }
        ]
      }
    ]

    // Call the LLM
    const markdown = await generateCompletion(
      { provider: model.provider, modelId: model.modelId },
      messages
    )

    return NextResponse.json({ markdown })
  } catch (error: any) {
    console.error('PDF to markdown error:', error)
    return NextResponse.json({ error: error.message || 'Unknown error' }, { status: 500 })
  }
} 