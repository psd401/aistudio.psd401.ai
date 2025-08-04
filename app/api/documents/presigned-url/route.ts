import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerSession } from '@/lib/auth/server-session'
import { getCurrentUserAction } from '@/actions/db/get-current-user-action'
import { generateUploadPresignedUrl } from '@/lib/aws/s3-client'
import { getSetting } from '@/lib/settings-manager'
import logger from '@/lib/logger'

// Get file size limit from settings or environment variable
async function getMaxFileSize(): Promise<number> {
  const maxSizeMB = await getSetting('MAX_FILE_SIZE_MB') || process.env.MAX_FILE_SIZE_MB || '25'
  return parseInt(maxSizeMB, 10) * 1024 * 1024
}

// Supported file types
const ALLOWED_FILE_EXTENSIONS = ['.pdf', '.docx', '.txt']
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain'
]

// Request validation schema (we'll validate file size dynamically in the handler)
const PresignedUrlRequestSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileType: z.string().refine(
    (type) => ALLOWED_MIME_TYPES.includes(type),
    { message: `Unsupported file type. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}` }
  ),
  fileSize: z.number().positive()
})

export async function POST(request: NextRequest) {
  logger.info('[Presigned URL API] Handler entered')

  const headers = {
    'Content-Type': 'application/json',
  }

  try {
    // Check authentication
    const session = await getServerSession()
    if (!session) {
      logger.info('[Presigned URL API] Unauthorized - No session')
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers }
      )
    }

    const currentUser = await getCurrentUserAction()
    if (!currentUser.isSuccess) {
      logger.info('[Presigned URL API] Unauthorized - User not found')
      return NextResponse.json(
        { error: 'User not found' },
        { status: 401, headers }
      )
    }

    const userId = currentUser.data.user.id
    logger.info(`[Presigned URL API] User ID: ${userId}`)

    // Parse and validate request body
    const body = await request.json()
    const validation = PresignedUrlRequestSchema.safeParse(body)

    if (!validation.success) {
      const errorMessage = validation.error.errors.map(e => e.message).join(', ')
      logger.info('[Presigned URL API] Validation error:', errorMessage)
      return NextResponse.json(
        { error: errorMessage },
        { status: 400, headers }
      )
    }

    const { fileName, fileType, fileSize } = validation.data

    // Get max file size and validate
    const maxFileSize = await getMaxFileSize()
    if (fileSize > maxFileSize) {
      logger.info('[Presigned URL API] File size exceeds limit:', { fileSize, maxFileSize })
      return NextResponse.json(
        { error: `File size must be less than ${maxFileSize / (1024 * 1024)}MB` },
        { status: 400, headers }
      )
    }

    // Validate file extension matches content type
    const fileExtension = `.${fileName.split('.').pop()?.toLowerCase()}`
    if (!ALLOWED_FILE_EXTENSIONS.includes(fileExtension)) {
      logger.info('[Presigned URL API] Invalid file extension:', fileExtension)
      return NextResponse.json(
        { error: `Unsupported file extension. Allowed types: ${ALLOWED_FILE_EXTENSIONS.join(', ')}` },
        { status: 400, headers }
      )
    }

    logger.info('[Presigned URL API] Generating presigned URL for:', {
      fileName,
      fileType,
      fileSize,
      userId: String(userId)
    })

    // Generate presigned URL
    const presignedData = await generateUploadPresignedUrl({
      userId: String(userId),
      fileName,
      contentType: fileType,
      fileSize,
      metadata: {
        originalName: fileName,
        uploadedBy: String(userId),
      },
      expiresIn: 3600 // 1 hour
    })

    logger.info('[Presigned URL API] Presigned URL generated successfully')

    return NextResponse.json({
      success: true,
      url: presignedData.url,
      key: presignedData.key,
      fields: presignedData.fields,
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString()
    }, { status: 200, headers })

  } catch (error) {
    logger.error('[Presigned URL API] Error:', error)
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to generate upload URL'
      },
      { status: 500, headers }
    )
  }
}