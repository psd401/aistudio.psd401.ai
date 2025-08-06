# File Upload Architecture

## Overview
The application now uses a hybrid approach for file uploads to work around AWS Amplify SSR's 1MB request body limitation.

## Upload Flow

### Small Files (≤ 1MB)
1. Files are uploaded directly to `/api/documents/upload`
2. The API processes the file in memory
3. Text is extracted and chunked
4. File is uploaded to S3
5. Metadata is saved to the database

### Large Files (> 1MB)
1. Client requests a presigned URL from `/api/documents/presigned-url`
2. Client uploads file directly to S3 using the presigned URL
3. Client notifies `/api/documents/process` of successful upload
4. Server downloads file from S3 for processing
5. Text is extracted and chunked
6. Metadata is saved to the database

## Benefits
- Bypasses Amplify's 1MB limit for production deployments
- Provides real-time upload progress for large files
- Reduces server memory usage for large uploads
- Maintains backward compatibility for small files

## Configuration
- File size limit is controlled by `MAX_FILE_SIZE_MB` environment variable (default: 25MB)
- The 1MB threshold for switching to presigned URLs is hardcoded based on AWS Amplify's request body size limit

## Security
- Presigned URLs expire after 1 hour
- S3 keys include user ID for access isolation
- Processing endpoint validates S3 object ownership
- All endpoints require authentication

## Related Files
- `/app/api/documents/presigned-url/route.ts` - Generates presigned URLs
- `/app/api/documents/process/route.ts` - Processes uploaded files
- `/app/(protected)/chat/_components/document-upload.tsx` - Client upload component
- `/lib/aws/s3-client.ts` - S3 utilities including presigned URL generation

## GitHub Issue
This implementation addresses issue #73: File uploads failing with HTTP 413 on production environment