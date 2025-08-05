import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getServerSession } from '@/lib/auth/server-session'
import { getCurrentUserAction } from '@/actions/db/get-current-user-action'
import { generateUploadPresignedUrl } from '@/lib/aws/s3-client'
import { createLogger, generateRequestId, startTimer } from '@/lib/logger'
import { withActionState, unauthorized } from '@/lib/api-utils'
import { handleError } from '@/lib/error-utils'
import { type ActionState } from '@/types/actions-types'
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

interface PresignedUrlResponse {
  url: string
  key: string
  fields: Record<string, string>
  expiresAt: string
}

export async function POST(request: NextRequest) {
  const requestId = generateRequestId();
  const timer = startTimer("api.documents.presigned-url");
  const log = createLogger({ requestId, route: "api.documents.presigned-url" });
  
  log.info("POST /api/documents/presigned-url - Generating presigned URL");

  // Check authentication
  const session = await getServerSession()
  if (!session) {
    log.warn("Unauthorized - No session");
    timer({ status: "error", reason: "unauthorized" });
    return unauthorized()
  }

  const currentUser = await getCurrentUserAction()
  if (!currentUser.isSuccess || !currentUser.data?.user) {
    log.warn("Unauthorized - User not found");
    timer({ status: "error", reason: "user_not_found" });
    return unauthorized('User not found')
  }

  const userId = currentUser.data.user.id
  log.debug("Processing for user", { userId });

  return withActionState(async (): Promise<ActionState<PresignedUrlResponse>> => {
    try {
      // Parse and validate request body
      const body = await request.json()
      const validation = PresignedUrlRequestSchema.safeParse(body)

      if (!validation.success) {
        const errorMessage = validation.error.errors.map(e => e.message).join(', ')
        log.warn("Validation error", { error: errorMessage });
        timer({ status: "error", reason: "validation_error" });
        return { isSuccess: false, message: errorMessage }
      }

      const { fileName, fileType, fileSize } = validation.data

      // Get max file size and validate
      const maxFileSize = await getMaxFileSize()
      if (fileSize > maxFileSize) {
        log.warn("File size exceeds limit", { fileSize, maxFileSize });
        timer({ status: "error", reason: "file_too_large" });
        return { 
          isSuccess: false, 
          message: `File size must be less than ${formatFileSize(maxFileSize)}` 
        }
      }

      // Validate file extension
      if (!isValidFileExtension(fileName)) {
        log.warn("Invalid file extension", { fileName });
        timer({ status: "error", reason: "invalid_extension" });
        return { 
          isSuccess: false, 
          message: `Unsupported file extension. Allowed types: ${ALLOWED_FILE_EXTENSIONS.join(', ')}` 
        }
      }

      log.debug("Generating presigned URL", {
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

      log.info("Presigned URL generated successfully", { key: presignedData.key });
      timer({ status: "success" });

      return {
        isSuccess: true,
        message: 'Presigned URL generated successfully',
        data: {
          url: presignedData.url,
          key: presignedData.key,
          fields: presignedData.fields,
          expiresAt: new Date(Date.now() + 3600 * 1000).toISOString()
        },
        headers: { "X-Request-Id": requestId }
      }
    } catch (error) {
      timer({ status: "error" });
      log.error("Failed to generate presigned URL", error);
      return handleError(error, 'Failed to generate presigned URL')
    }
  })
}