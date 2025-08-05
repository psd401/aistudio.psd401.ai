import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getServerSession } from '@/lib/auth/server-session'
import { getCurrentUserAction } from '@/actions/db/get-current-user-action'
import { generateUploadPresignedUrl } from '@/lib/aws/s3-client'
import logger from '@/lib/logger'
import { withErrorHandling, unauthorized } from '@/lib/api-utils'
import { createError } from '@/lib/error-utils'
import { ErrorLevel } from '@/types/actions-types'
import { 
  ALLOWED_MIME_TYPES,
  ALLOWED_FILE_EXTENSIONS,
  getMaxFileSize, 
  isValidFileExtension,
  formatFileSize 
} from '@/lib/file-validation'


// Request validation schema (we'll validate file size dynamically in the handler)
const PresignedUrlRequestSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileType: z.string().refine(
    (type): type is typeof ALLOWED_MIME_TYPES[number] => ALLOWED_MIME_TYPES.includes(type as typeof ALLOWED_MIME_TYPES[number]),
    { message: `Unsupported file type. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}` }
  ),
  fileSize: z.number().positive()
})

export async function POST(request: NextRequest) {
  logger.info('[Presigned URL API] Handler entered')

  // Check authentication
  const session = await getServerSession()
  if (!session) {
    logger.info('[Presigned URL API] Unauthorized - No session')
    return unauthorized()
  }

  const currentUser = await getCurrentUserAction()
  if (!currentUser.isSuccess || !currentUser.data?.user) {
    logger.info('[Presigned URL API] Unauthorized - User not found')
    return unauthorized('User not found')
  }

  const userId = currentUser.data.user.id
  logger.info(`[Presigned URL API] User ID: ${userId}`)

  return withErrorHandling(async () => {

    // Parse and validate request body
    const body = await request.json()
    const validation = PresignedUrlRequestSchema.safeParse(body)

    if (!validation.success) {
      const errorMessage = validation.error.errors.map(e => e.message).join(', ')
      logger.info('[Presigned URL API] Validation error:', errorMessage)
      throw createError(errorMessage, {
        code: 'VALIDATION',
        level: ErrorLevel.WARN
      })
    }

    const { fileName, fileType, fileSize } = validation.data

    // Get max file size and validate
    const maxFileSize = await getMaxFileSize()
    if (fileSize > maxFileSize) {
      logger.info('[Presigned URL API] File size exceeds limit:', { fileSize, maxFileSize })
      throw createError(`File size must be less than ${formatFileSize(maxFileSize)}`, {
        code: 'VALIDATION',
        level: ErrorLevel.WARN
      })
    }

    // Validate file extension
    if (!isValidFileExtension(fileName)) {
      logger.info('[Presigned URL API] Invalid file extension:', fileName)
      throw createError(`Unsupported file extension. Allowed types: ${ALLOWED_FILE_EXTENSIONS.join(', ')}`, {
        code: 'VALIDATION',
        level: ErrorLevel.WARN
      })
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

    return {
      url: presignedData.url,
      key: presignedData.key,
      fields: presignedData.fields,
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString()
    }
  })
}