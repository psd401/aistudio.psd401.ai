import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerSession } from '@/lib/auth/server-session'
import { getCurrentUserAction } from '@/actions/db/get-current-user-action'
import { getObjectStream, documentExists } from '@/lib/aws/s3-client'
import { saveDocument, batchInsertDocumentChunks } from '@/lib/db/queries/documents'
import { extractTextFromDocument, chunkText, getFileTypeFromFileName } from '@/lib/document-processing'
import { getSetting } from '@/lib/settings-manager'
import logger from '@/lib/logger'

// Ensure this route is built for the Node.js runtime
export const runtime = "nodejs"

// Get file size limit from settings or environment variable
async function getMaxFileSize(): Promise<number> {
  const maxSizeMB = await getSetting('MAX_FILE_SIZE_MB') || process.env.MAX_FILE_SIZE_MB || '25'
  return parseInt(maxSizeMB, 10) * 1024 * 1024
}

// Request validation schema
const ProcessDocumentRequestSchema = z.object({
  key: z.string().min(1),
  fileName: z.string().min(1).max(255),
  fileSize: z.number().positive(),
  conversationId: z.number().nullable().optional()
})

export async function POST(request: NextRequest) {
  logger.info('[Process Document API] Handler entered')

  const headers = {
    'Content-Type': 'application/json',
  }

  try {
    // Check authentication
    const session = await getServerSession()
    if (!session) {
      logger.info('[Process Document API] Unauthorized - No session')
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers }
      )
    }

    const currentUser = await getCurrentUserAction()
    if (!currentUser.isSuccess) {
      logger.info('[Process Document API] Unauthorized - User not found')
      return NextResponse.json(
        { error: 'User not found' },
        { status: 401, headers }
      )
    }

    const userId = currentUser.data.user.id
    logger.info(`[Process Document API] User ID: ${userId}`)

    // Parse and validate request body
    const body = await request.json()
    const validation = ProcessDocumentRequestSchema.safeParse(body)

    if (!validation.success) {
      const errorMessage = validation.error.errors.map(e => e.message).join(', ')
      logger.info('[Process Document API] Validation error:', errorMessage)
      return NextResponse.json(
        { error: errorMessage },
        { status: 400, headers }
      )
    }

    const { key, fileName, fileSize, conversationId } = validation.data

    // Verify file size is within limits
    const maxFileSize = await getMaxFileSize()
    if (fileSize > maxFileSize) {
      logger.info('[Process Document API] File size exceeds limit:', { fileSize, maxFileSize })
      return NextResponse.json(
        { error: `File size must be less than ${maxFileSize / (1024 * 1024)}MB` },
        { status: 400, headers }
      )
    }

    // Verify the S3 key belongs to this user
    if (!key.startsWith(`${userId}/`)) {
      logger.error('[Process Document API] Unauthorized access attempt to S3 key:', { key, userId })
      return NextResponse.json(
        { error: 'Unauthorized access to document' },
        { status: 403, headers }
      )
    }

    // Verify document exists in S3
    const exists = await documentExists(key)
    if (!exists) {
      logger.error('[Process Document API] Document not found in S3:', key)
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404, headers }
      )
    }

    logger.info('[Process Document API] Retrieving document from S3:', key)

    // Get document stream from S3
    const { stream, metadata } = await getObjectStream(key)

    // Extract file type
    const fileType = getFileTypeFromFileName(fileName)
    logger.info(`[Process Document API] File type: ${fileType}`)

    // Convert stream to buffer for processing
    const chunks: Buffer[] = []
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    const fileBuffer = Buffer.concat(chunks)
    logger.info(`[Process Document API] File retrieved, size: ${fileBuffer.length}`)

    // Process document content for text extraction
    logger.info('[Process Document API] Extracting text from document...')
    let text, extractedMetadata
    try {
      const extracted = await extractTextFromDocument(fileBuffer, fileType)
      text = extracted.text
      extractedMetadata = extracted.metadata
      logger.info(`[Process Document API] Text extracted, length: ${text?.length ?? 0}`)
    } catch (extractError) {
      logger.error('[Process Document API] Error extracting text:', extractError)
      return NextResponse.json(
        { 
          error: `Failed to extract text from document: ${extractError instanceof Error ? extractError.message : String(extractError)}` 
        },
        { status: 500, headers }
      )
    }

    // Ensure text is not null or undefined
    if (!text) {
      logger.error('[Process Document API] No text content extracted from document')
      return NextResponse.json(
        { error: 'Failed to extract text content from document' },
        { status: 500, headers }
      )
    }

    // Save document metadata to database
    logger.info('[Process Document API] Saving document to database...')
    let document
    try {
      document = await saveDocument({
        userId,
        conversationId: conversationId || null,
        name: fileName,
        type: fileType,
        size: fileSize,
        url: key, // Store S3 key
        metadata: {
          ...extractedMetadata,
          originalName: metadata?.originalName || fileName,
          uploadedAt: metadata?.uploadedAt || new Date().toISOString()
        }
      })
      logger.info(`[Process Document API] Document saved to database: ${document.id}`)
    } catch (saveError) {
      logger.error('[Process Document API] Error saving document:', saveError)
      return NextResponse.json(
        { 
          error: `Failed to save document: ${saveError instanceof Error ? saveError.message : String(saveError)}` 
        },
        { status: 500, headers }
      )
    }

    // Chunk text and save to database
    logger.info('[Process Document API] Chunking text...')
    let textChunks: string[] = []
    try {
      textChunks = chunkText(text)
      logger.info(`[Process Document API] Created ${textChunks.length} chunks`)
      
      if (textChunks.length > 0) {
        const documentChunks = textChunks.map((chunk, index) => ({
          documentId: document.id,
          content: chunk,
          chunkIndex: index,
          metadata: { position: index }
        }))

        logger.info('[Process Document API] Saving chunks to database...')
        const savedChunks = await batchInsertDocumentChunks(documentChunks)
        logger.info(`[Process Document API] Saved ${savedChunks.length} chunks`)
      } else {
        logger.warn('[Process Document API] No chunks created from document')
      }
    } catch (chunkError) {
      logger.error('[Process Document API] Error processing chunks:', chunkError)
      // Note: We don't fail the whole operation if chunking fails
      // The document is already saved and can be re-processed later
    }

    // Return success response
    return NextResponse.json({
      success: true,
      document: {
        id: document.id,
        name: document.name,
        type: document.type,
        size: document.size,
        url: document.url,
        totalChunks: textChunks.length
      }
    }, { status: 200, headers })

  } catch (error) {
    logger.error('[Process Document API] Unexpected error:', error)
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to process document'
      },
      { status: 500, headers }
    )
  }
}