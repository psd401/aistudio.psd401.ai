# Testing File Processing Infrastructure

This guide helps you verify that the file processing infrastructure is working correctly after deployment.

## Prerequisites

1. All CDK stacks deployed successfully
2. Environment variables configured in AWS Amplify
3. Application deployed and accessible
4. Administrator access to the application

## Testing Steps

### 1. Verify Infrastructure Components

#### Check Lambda Functions
```bash
# List file processing Lambda functions
aws lambda list-functions --query "Functions[?contains(FunctionName, 'FileProcessor') || contains(FunctionName, 'URLProcessor')].[FunctionName,Runtime,MemorySize,Timeout]" --output table

# Test Lambda configuration
aws lambda get-function --function-name <FileProcessorFunctionName> --query 'Configuration.[MemorySize,Timeout,Handler,Runtime]'
```

#### Check SQS Queue
```bash
# Get queue URL
aws sqs list-queues --query "QueueUrls[?contains(@, 'file-processing')]"

# Check queue attributes
aws sqs get-queue-attributes --queue-url <QueueUrl> --attribute-names All
```

#### Check DynamoDB Table
```bash
# List tables
aws dynamodb list-tables --query "TableNames[?contains(@, 'job-status')]"

# Describe table
aws dynamodb describe-table --table-name <JobStatusTableName>
```

### 2. Test Document Upload and Processing

#### Test PDF Processing
1. Navigate to `/admin/repositories`
2. Create a new test repository
3. Click "Add Item" and select "Document"
4. Upload a small PDF file (< 5MB for quick testing)
5. Monitor the processing:
   - Status should change from "pending" to "processing" to "completed"
   - This typically takes 10-30 seconds for small files

#### Test Other Document Types
Repeat the above with:
- Word document (.docx)
- Excel spreadsheet (.xlsx)
- Text file (.txt)
- Markdown file (.md)
- CSV file (.csv)

#### Verify Processing Results
```sql
-- Connect to RDS via Query Editor and run:
-- Check repository items
SELECT id, name, type, processing_status, processing_error 
FROM repository_items 
WHERE repository_id = <your-test-repo-id>
ORDER BY created_at DESC;

-- Check generated chunks
SELECT ri.name, COUNT(dc.id) as chunk_count, SUM(dc.tokens) as total_tokens
FROM repository_items ri
LEFT JOIN document_chunks dc ON ri.id = dc.document_id
WHERE ri.repository_id = <your-test-repo-id>
GROUP BY ri.id, ri.name;

-- View sample chunks
SELECT content, chunk_index, tokens 
FROM document_chunks 
WHERE document_id = <your-item-id>
ORDER BY chunk_index
LIMIT 5;
```

### 3. Test URL Processing

1. In the repository, click "Add Item" and select "URL"
2. Add a public documentation page (e.g., `https://docs.aws.amazon.com/lambda/latest/dg/welcome.html`)
3. Monitor processing status
4. Verify content extraction in the database

### 4. Monitor CloudWatch Logs

#### File Processor Logs
```bash
# Get recent logs
aws logs tail /aws/lambda/<FileProcessorFunctionName> --follow

# Search for errors
aws logs filter-log-events --log-group-name /aws/lambda/<FileProcessorFunctionName> --filter-pattern "ERROR"
```

#### URL Processor Logs
```bash
# Get recent logs
aws logs tail /aws/lambda/<URLProcessorFunctionName> --follow
```

### 5. Test Error Handling

#### Test Invalid File Type
1. Try uploading an unsupported file type (e.g., .zip)
2. Should see appropriate error message

#### Test Large File
1. Upload a file larger than 25MB
2. Should be rejected with size limit error

#### Test Processing Failure
1. Check Dead Letter Queue for any failed messages:
```bash
aws sqs receive-message --queue-url <DLQUrl> --max-number-of-messages 10
```

### 6. Performance Testing

#### Check Processing Times
```bash
# Query CloudWatch metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Duration \
  --dimensions Name=FunctionName,Value=<FileProcessorFunctionName> \
  --statistics Average,Maximum \
  --start-time 2024-01-26T00:00:00Z \
  --end-time 2024-01-27T00:00:00Z \
  --period 3600
```

#### Check Queue Metrics
```bash
# Messages in queue
aws cloudwatch get-metric-statistics \
  --namespace AWS/SQS \
  --metric-name ApproximateNumberOfMessagesVisible \
  --dimensions Name=QueueName,Value=file-processing-queue \
  --statistics Average,Maximum \
  --start-time 2024-01-26T00:00:00Z \
  --end-time 2024-01-27T00:00:00Z \
  --period 300
```

### 7. Test Search Functionality

After documents are processed:
1. Use the search feature in the repository
2. Search for keywords you know are in the documents
3. Verify search results return relevant chunks

## Common Issues and Solutions

### Issue: Items stuck in "pending" status
**Solution**: 
- Check if Lambda functions have correct permissions
- Verify SQS queue URL is correctly set in environment variables
- Check CloudWatch logs for errors

### Issue: "Access Denied" errors in logs
**Solution**:
- Verify Lambda execution role has S3 read permissions
- Check RDS Data API permissions
- Ensure Secrets Manager access is configured

### Issue: Processing very slow
**Solution**:
- Check Lambda memory allocation (should be 3GB for FileProcessor)
- Monitor concurrent executions
- Check if DLQ has messages indicating failures

### Issue: No chunks created
**Solution**:
- Verify database table name matches configuration
- Check if text extraction is working (logs)
- Ensure document has extractable text content

## Load Testing (Optional)

For production readiness testing:

```bash
# Upload multiple files simultaneously
for i in {1..10}; do
  # Use your test files
  echo "Uploading file $i"
  # Add upload command here
done

# Monitor queue depth and Lambda invocations
watch -n 5 'aws sqs get-queue-attributes --queue-url <QueueUrl> --attribute-names ApproximateNumberOfMessages'
```

## Success Criteria

✅ All test files process successfully
✅ Processing completes within reasonable time (< 1 minute for files under 10MB)
✅ Text is correctly extracted and chunked
✅ No errors in CloudWatch logs
✅ Search returns relevant results
✅ Dead Letter Queue remains empty
✅ System handles concurrent uploads

## Next Steps

Once testing is complete:
1. Document any issues found
2. Adjust Lambda memory/timeout if needed
3. Consider enabling CloudWatch alarms for production monitoring
4. Plan for regular monitoring of DLQ and processing times