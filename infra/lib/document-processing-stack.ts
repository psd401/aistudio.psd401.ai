import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as eventsources from 'aws-cdk-lib/aws-lambda-event-sources';
import { Construct } from 'constructs';

export interface DocumentProcessingStackProps extends cdk.StackProps {
  environment: string;
  rdsClusterArn?: string;
  rdsSecretArn?: string;
}

export class DocumentProcessingStack extends cdk.Stack {
  public readonly documentJobsTable: dynamodb.Table;
  public readonly documentsBucket: s3.Bucket;
  public readonly processingQueue: sqs.Queue;
  public readonly processingDLQ: sqs.Queue;
  public readonly highMemoryQueue: sqs.Queue;
  public readonly standardProcessor: lambda.Function;
  public readonly highMemoryProcessor: lambda.Function;

  constructor(scope: Construct, id: string, props: DocumentProcessingStackProps) {
    super(scope, id, props);

    const { environment } = props;

    // DynamoDB table for job tracking with fast polling
    this.documentJobsTable = new dynamodb.Table(this, 'DocumentJobs', {
      tableName: `AIStudio-DocumentJobs-${environment}`,
      partitionKey: {
        name: 'jobId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'timestamp',
        type: dynamodb.AttributeType.NUMBER,
      },
      timeToLiveAttribute: 'ttl',
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // GSI for querying by user ID
    this.documentJobsTable.addGlobalSecondaryIndex({
      indexName: 'UserIdIndex',
      partitionKey: {
        name: 'userId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'timestamp',
        type: dynamodb.AttributeType.NUMBER,
      },
    });

    // GSI for querying by status
    this.documentJobsTable.addGlobalSecondaryIndex({
      indexName: 'StatusIndex',
      partitionKey: {
        name: 'status',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'timestamp',
        type: dynamodb.AttributeType.NUMBER,
      },
    });

    // S3 bucket for document storage with intelligent tiering
    this.documentsBucket = new s3.Bucket(this, 'DocumentsBucket', {
      bucketName: `aistudio-documents-${environment}-${this.account}`,
      versioned: true,
      lifecycleRules: [
        {
          id: 'intelligent-tiering',
          enabled: true,
          transitions: [
            {
              storageClass: s3.StorageClass.INTELLIGENT_TIERING,
              transitionAfter: cdk.Duration.days(0),
            },
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: cdk.Duration.days(90),
            },
          ],
        },
      ],
      cors: [
        {
          allowedHeaders: ['*'],
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT, s3.HttpMethods.POST],
          allowedOrigins: ['*'], // TODO: Restrict to specific origins in production
          exposedHeaders: ['ETag'],
          maxAge: 3600,
        },
      ],
      removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: environment !== 'prod',
    });

    // Dead Letter Queue for failed processing jobs
    this.processingDLQ = new sqs.Queue(this, 'ProcessingDLQ', {
      queueName: `AIStudio-DocumentProcessing-DLQ-${environment}`,
      retentionPeriod: cdk.Duration.days(14),
      removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // Standard processing queue for files under 50MB
    this.processingQueue = new sqs.Queue(this, 'ProcessingQueue', {
      queueName: `AIStudio-DocumentProcessing-${environment}`,
      visibilityTimeout: cdk.Duration.minutes(15), // 15 minutes for processing
      receiveMessageWaitTime: cdk.Duration.seconds(20), // Long polling
      deadLetterQueue: {
        queue: this.processingDLQ,
        maxReceiveCount: 3,
      },
      removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // High-memory queue for large files (50MB+)
    this.highMemoryQueue = new sqs.Queue(this, 'HighMemoryQueue', {
      queueName: `AIStudio-DocumentProcessing-HighMemory-${environment}`,
      visibilityTimeout: cdk.Duration.minutes(30), // 30 minutes for large file processing
      receiveMessageWaitTime: cdk.Duration.seconds(20),
      deadLetterQueue: {
        queue: this.processingDLQ,
        maxReceiveCount: 2, // Fewer retries for expensive operations
      },
      removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // IAM role for Lambda processors
    const processorRole = new iam.Role(this, 'ProcessorRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
      inlinePolicies: {
        ProcessorPolicy: new iam.PolicyDocument({
          statements: [
            // S3 permissions
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                's3:GetObject',
                's3:PutObject',
                's3:DeleteObject',
                's3:GetObjectVersion',
              ],
              resources: [`${this.documentsBucket.bucketArn}/*`],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['s3:ListBucket'],
              resources: [this.documentsBucket.bucketArn],
            }),
            // DynamoDB permissions
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'dynamodb:PutItem',
                'dynamodb:GetItem',
                'dynamodb:UpdateItem',
                'dynamodb:DeleteItem',
                'dynamodb:Query',
                'dynamodb:Scan',
              ],
              resources: [
                this.documentJobsTable.tableArn,
                `${this.documentJobsTable.tableArn}/index/*`,
              ],
            }),
            // SQS permissions for cross-queue messaging
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'sqs:SendMessage',
                'sqs:ReceiveMessage',
                'sqs:DeleteMessage',
                'sqs:GetQueueAttributes',
              ],
              resources: [
                this.processingQueue.queueArn,
                this.highMemoryQueue.queueArn,
                this.processingDLQ.queueArn,
              ],
            }),
            // Textract permissions for OCR
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'textract:StartDocumentTextDetection',
                'textract:StartDocumentAnalysis',
                'textract:GetDocumentTextDetection',
                'textract:GetDocumentAnalysis',
              ],
              resources: ['*'],
            }),
            // RDS Data API permissions (if provided)
            ...(props.rdsClusterArn ? [
              new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: [
                  'rds-data:ExecuteStatement',
                  'rds-data:BatchExecuteStatement',
                  'rds-data:BeginTransaction',
                  'rds-data:CommitTransaction',
                  'rds-data:RollbackTransaction',
                ],
                resources: [props.rdsClusterArn],
              }),
            ] : []),
            // Secrets Manager permissions (if provided)
            ...(props.rdsSecretArn ? [
              new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: [
                  'secretsmanager:GetSecretValue',
                  'secretsmanager:DescribeSecret',
                ],
                resources: [props.rdsSecretArn],
              }),
            ] : []),
          ],
        }),
      },
    });

    // Standard Lambda processor (3GB memory, 15 min timeout)
    this.standardProcessor = new lambda.Function(this, 'StandardProcessor', {
      functionName: `AIStudio-DocumentProcessor-Standard-${environment}`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambdas/document-processor-v2'),
      memorySize: 3008, // 3GB for standard processing
      timeout: cdk.Duration.minutes(15),
      role: processorRole,
      environment: {
        DOCUMENTS_BUCKET_NAME: this.documentsBucket.bucketName,
        DOCUMENT_JOBS_TABLE: this.documentJobsTable.tableName,
        HIGH_MEMORY_QUEUE_URL: this.highMemoryQueue.queueUrl,
        DLQ_URL: this.processingDLQ.queueUrl,
        ...(props.rdsClusterArn && { DATABASE_RESOURCE_ARN: props.rdsClusterArn }),
        ...(props.rdsSecretArn && { DATABASE_SECRET_ARN: props.rdsSecretArn }),
        DATABASE_NAME: 'aistudio',
      },
      deadLetterQueueEnabled: true,
      retryAttempts: 2,
    });

    // High-memory Lambda processor (10GB memory, 30 min timeout)
    this.highMemoryProcessor = new lambda.Function(this, 'HighMemoryProcessor', {
      functionName: `AIStudio-DocumentProcessor-HighMemory-${environment}`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambdas/document-processor-v2'),
      memorySize: 10240, // 10GB for large file processing
      timeout: cdk.Duration.minutes(30),
      role: processorRole,
      environment: {
        DOCUMENTS_BUCKET_NAME: this.documentsBucket.bucketName,
        DOCUMENT_JOBS_TABLE: this.documentJobsTable.tableName,
        DLQ_URL: this.processingDLQ.queueUrl,
        PROCESSOR_TYPE: 'HIGH_MEMORY',
        ...(props.rdsClusterArn && { DATABASE_RESOURCE_ARN: props.rdsClusterArn }),
        ...(props.rdsSecretArn && { DATABASE_SECRET_ARN: props.rdsSecretArn }),
        DATABASE_NAME: 'aistudio',
      },
      deadLetterQueueEnabled: true,
      retryAttempts: 1, // Fewer retries for expensive operations
    });

    // Event sources for Lambda triggers
    this.standardProcessor.addEventSource(
      new eventsources.SqsEventSource(this.processingQueue, {
        batchSize: 5, // Process up to 5 documents at once
        maxConcurrency: 10, // Limit concurrent executions
        reportBatchItemFailures: true,
      })
    );

    this.highMemoryProcessor.addEventSource(
      new eventsources.SqsEventSource(this.highMemoryQueue, {
        batchSize: 1, // Process one large file at a time
        maxConcurrency: 2, // Limit concurrent high-memory processing
        reportBatchItemFailures: true,
      })
    );

    // S3 bucket notification to trigger processing
    this.documentsBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.SqsDestination(this.processingQueue),
      {
        prefix: 'uploads/',
        suffix: '.pdf',
      }
    );

    this.documentsBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.SqsDestination(this.processingQueue),
      {
        prefix: 'uploads/',
        suffix: '.docx',
      }
    );

    this.documentsBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.SqsDestination(this.processingQueue),
      {
        prefix: 'uploads/',
        suffix: '.xlsx',
      }
    );

    this.documentsBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.SqsDestination(this.processingQueue),
      {
        prefix: 'uploads/',
        suffix: '.pptx',
      }
    );

    // CloudWatch Alarms for monitoring
    const processingErrors = this.standardProcessor.metricErrors({
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    });

    const highMemoryErrors = this.highMemoryProcessor.metricErrors({
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    });

    const dlqMessages = this.processingDLQ.metric('ApproximateNumberOfVisibleMessages', {
      statistic: 'Maximum',
      period: cdk.Duration.minutes(5),
    });

    // Create CloudWatch Dashboard
    const dashboard = new cdk.aws_cloudwatch.Dashboard(this, 'DocumentProcessingDashboard', {
      dashboardName: `AIStudio-DocumentProcessing-${environment}`,
    });

    dashboard.addWidgets(
      new cdk.aws_cloudwatch.GraphWidget({
        title: 'Processing Errors',
        left: [processingErrors, highMemoryErrors],
        width: 12,
        height: 6,
      }),
      new cdk.aws_cloudwatch.GraphWidget({
        title: 'Dead Letter Queue Messages',
        left: [dlqMessages],
        width: 12,
        height: 6,
      }),
      new cdk.aws_cloudwatch.GraphWidget({
        title: 'Lambda Duration',
        left: [
          this.standardProcessor.metricDuration({
            statistic: 'Average',
            period: cdk.Duration.minutes(5),
          }),
          this.highMemoryProcessor.metricDuration({
            statistic: 'Average',
            period: cdk.Duration.minutes(5),
          }),
        ],
        width: 12,
        height: 6,
      })
    );

    // Stack outputs
    new cdk.CfnOutput(this, 'DocumentJobsTableName', {
      value: this.documentJobsTable.tableName,
      description: 'DynamoDB table for document job tracking',
    });

    new cdk.CfnOutput(this, 'DocumentsBucketName', {
      value: this.documentsBucket.bucketName,
      description: 'S3 bucket for document storage',
    });

    new cdk.CfnOutput(this, 'ProcessingQueueUrl', {
      value: this.processingQueue.queueUrl,
      description: 'SQS queue for standard document processing',
    });

    new cdk.CfnOutput(this, 'HighMemoryQueueUrl', {
      value: this.highMemoryQueue.queueUrl,
      description: 'SQS queue for high-memory document processing',
    });
  }
}