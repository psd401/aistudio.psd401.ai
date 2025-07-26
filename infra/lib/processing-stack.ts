import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
// import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as path from 'path';

export interface ProcessingStackProps extends cdk.StackProps {
  environment: 'dev' | 'prod';
  documentsBucketName: string;
  databaseResourceArn: string;
  databaseSecretArn: string;
}

export class ProcessingStack extends cdk.Stack {
  public readonly fileProcessingQueue: sqs.Queue;
  public readonly embeddingQueue: sqs.Queue;
  public readonly jobStatusTable: dynamodb.Table;
  public readonly textractCompletionTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: ProcessingStackProps) {
    super(scope, id, props);

    // Import the documents bucket
    const documentsBucket = s3.Bucket.fromBucketName(
      this,
      'DocumentsBucket',
      props.documentsBucketName
    );

    // DynamoDB table for job status tracking
    this.jobStatusTable = new dynamodb.Table(this, 'JobStatusTable', {
      partitionKey: { name: 'jobId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.NUMBER },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: props.environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'ttl',
    });

    // Dead Letter Queue for failed processing jobs
    const dlq = new sqs.Queue(this, 'FileProcessingDLQ', {
      queueName: `aistudio-${props.environment}-file-processing-dlq`,
      retentionPeriod: cdk.Duration.days(14),
    });

    // Main processing queue
    this.fileProcessingQueue = new sqs.Queue(this, 'FileProcessingQueue', {
      queueName: `aistudio-${props.environment}-file-processing-queue`,
      visibilityTimeout: cdk.Duration.minutes(15), // Longer than Lambda timeout
      deadLetterQueue: {
        queue: dlq,
        maxReceiveCount: 3,
      },
    });

    // Dead Letter Queue for failed embedding jobs
    const embeddingDlq = new sqs.Queue(this, 'EmbeddingDLQ', {
      queueName: `aistudio-${props.environment}-embedding-dlq`,
      retentionPeriod: cdk.Duration.days(14),
    });

    // Embedding generation queue
    this.embeddingQueue = new sqs.Queue(this, 'EmbeddingQueue', {
      queueName: `aistudio-${props.environment}-embedding-queue`,
      visibilityTimeout: cdk.Duration.minutes(10), // Longer than Lambda timeout
      deadLetterQueue: {
        queue: embeddingDlq,
        maxReceiveCount: 3,
      },
    });

    // SNS Topic for Textract completion notifications
    this.textractCompletionTopic = new sns.Topic(this, 'TextractCompletionTopic', {
      topicName: `aistudio-${props.environment}-textract-completion`,
      displayName: 'Textract Job Completion Notifications',
    });

    // IAM Role for Textract to publish to SNS
    const textractRole = new iam.Role(this, 'TextractServiceRole', {
      assumedBy: new iam.ServicePrincipal('textract.amazonaws.com'),
      roleName: `aistudio-${props.environment}-textract-service-role`,
    });

    // Grant Textract permission to publish to SNS
    this.textractCompletionTopic.grantPublish(textractRole);

    // Lambda Layer for shared dependencies
    const processingLayer = new lambda.LayerVersion(this, 'ProcessingLayer', {
      code: lambda.Code.fromAsset(path.join(__dirname, '../layers/processing')),
      compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
      description: 'Shared processing utilities and dependencies',
    });

    // File Processor Lambda
    const fileProcessor = new lambda.Function(this, 'FileProcessor', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambdas/file-processor')),
      timeout: cdk.Duration.minutes(10),
      memorySize: 3008, // 3GB (adjusted to force update)
      environment: {
        NODE_OPTIONS: '--enable-source-maps',
        DOCUMENTS_BUCKET: documentsBucket.bucketName,
        JOB_STATUS_TABLE: this.jobStatusTable.tableName,
        DATABASE_RESOURCE_ARN: props.databaseResourceArn,
        DATABASE_SECRET_ARN: props.databaseSecretArn,
        DATABASE_NAME: 'aistudio',
        ENVIRONMENT: props.environment,
        EMBEDDING_QUEUE_URL: this.embeddingQueue.queueUrl,
        TEXTRACT_SNS_TOPIC_ARN: this.textractCompletionTopic.topicArn,
        TEXTRACT_ROLE_ARN: textractRole.roleArn,
      },
      layers: [processingLayer],
    });

    // URL Processor Lambda
    const urlProcessor = new lambda.Function(this, 'URLProcessor', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambdas/url-processor')),
      timeout: cdk.Duration.minutes(5),
      memorySize: 1024, // 1GB
      environment: {
        NODE_OPTIONS: '--enable-source-maps',
        JOB_STATUS_TABLE: this.jobStatusTable.tableName,
        DATABASE_RESOURCE_ARN: props.databaseResourceArn,
        DATABASE_SECRET_ARN: props.databaseSecretArn,
        DATABASE_NAME: 'aistudio',
        ENVIRONMENT: props.environment,
      },
      layers: [processingLayer],
    });

    // Embedding Generator Lambda
    const embeddingGenerator = new lambda.Function(this, 'EmbeddingGenerator', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambdas/embedding-generator')),
      timeout: cdk.Duration.minutes(5),
      memorySize: 1024, // 1GB
      environment: {
        NODE_OPTIONS: '--enable-source-maps',
        DB_CLUSTER_ARN: props.databaseResourceArn,
        DB_SECRET_ARN: props.databaseSecretArn,
        DB_NAME: 'aistudio',
        ENVIRONMENT: props.environment,
      },
      layers: [processingLayer],
    });

    // Textract Processor Lambda
    const textractProcessor = new lambda.Function(this, 'TextractProcessor', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambdas/textract-processor')),
      timeout: cdk.Duration.minutes(10),
      memorySize: 1024, // 1GB
      environment: {
        NODE_OPTIONS: '--enable-source-maps',
        DATABASE_RESOURCE_ARN: props.databaseResourceArn,
        DATABASE_SECRET_ARN: props.databaseSecretArn,
        DATABASE_NAME: 'aistudio',
        EMBEDDING_QUEUE_URL: this.embeddingQueue.queueUrl,
        ENVIRONMENT: props.environment,
      },
      layers: [processingLayer],
    });

    // Subscribe Textract processor to SNS topic
    this.textractCompletionTopic.addSubscription(
      new snsSubscriptions.LambdaSubscription(textractProcessor)
    );

    // Grant permissions
    documentsBucket.grantRead(fileProcessor);
    this.jobStatusTable.grantReadWriteData(fileProcessor);
    this.jobStatusTable.grantReadWriteData(urlProcessor);
    this.embeddingQueue.grantSendMessages(fileProcessor);
    this.embeddingQueue.grantSendMessages(textractProcessor);

    // Grant RDS Data API permissions
    const rdsDataApiPolicy = new iam.PolicyStatement({
      actions: [
        'rds-data:ExecuteStatement',
        'rds-data:BatchExecuteStatement',
        'rds-data:BeginTransaction',
        'rds-data:CommitTransaction',
        'rds-data:RollbackTransaction',
      ],
      resources: [props.databaseResourceArn],
    });

    const secretsManagerPolicy = new iam.PolicyStatement({
      actions: ['secretsmanager:GetSecretValue'],
      resources: [props.databaseSecretArn],
    });

    fileProcessor.addToRolePolicy(rdsDataApiPolicy);
    fileProcessor.addToRolePolicy(secretsManagerPolicy);
    urlProcessor.addToRolePolicy(rdsDataApiPolicy);
    urlProcessor.addToRolePolicy(secretsManagerPolicy);
    embeddingGenerator.addToRolePolicy(rdsDataApiPolicy);
    embeddingGenerator.addToRolePolicy(secretsManagerPolicy);
    textractProcessor.addToRolePolicy(rdsDataApiPolicy);
    textractProcessor.addToRolePolicy(secretsManagerPolicy);

    // Grant Textract permissions to file processor
    const textractPolicy = new iam.PolicyStatement({
      actions: [
        'textract:StartDocumentTextDetection',
        'textract:StartDocumentAnalysis',
        'textract:GetDocumentTextDetection',
        'textract:GetDocumentAnalysis',
      ],
      resources: ['*'],
    });
    fileProcessor.addToRolePolicy(textractPolicy);

    // Grant Textract result retrieval permissions to textract processor
    textractProcessor.addToRolePolicy(textractPolicy);

    // SQS event source for file processor
    fileProcessor.addEventSource(new lambdaEventSources.SqsEventSource(this.fileProcessingQueue, {
      batchSize: 1, // Process one file at a time
      maxBatchingWindow: cdk.Duration.seconds(5),
    }));

    // SQS event source for embedding generator
    embeddingGenerator.addEventSource(new lambdaEventSources.SqsEventSource(this.embeddingQueue, {
      batchSize: 1, // Process one item at a time to avoid rate limits
      maxBatchingWindow: cdk.Duration.seconds(5),
    }));

    // Outputs
    new cdk.CfnOutput(this, 'FileProcessingQueueUrl', {
      value: this.fileProcessingQueue.queueUrl,
      description: 'URL of the file processing queue',
      exportName: `${props.environment}-FileProcessingQueueUrl`,
    });

    new cdk.CfnOutput(this, 'FileProcessingQueueArn', {
      value: this.fileProcessingQueue.queueArn,
      description: 'ARN of the file processing queue',
      exportName: `${props.environment}-FileProcessingQueueArn`,
    });

    new cdk.CfnOutput(this, 'JobStatusTableName', {
      value: this.jobStatusTable.tableName,
      description: 'Name of the job status DynamoDB table',
      exportName: `${props.environment}-JobStatusTableName`,
    });

    new cdk.CfnOutput(this, 'FileProcessorFunctionName', {
      value: fileProcessor.functionName,
      description: 'Name of the file processor Lambda function',
      exportName: `${props.environment}-FileProcessorFunctionName`,
    });

    new cdk.CfnOutput(this, 'URLProcessorFunctionName', {
      value: urlProcessor.functionName,
      description: 'Name of the URL processor Lambda function',
      exportName: `${props.environment}-URLProcessorFunctionName`,
    });

    new cdk.CfnOutput(this, 'EmbeddingQueueUrl', {
      value: this.embeddingQueue.queueUrl,
      description: 'URL of the embedding generation queue',
      exportName: `${props.environment}-EmbeddingQueueUrl`,
    });

    new cdk.CfnOutput(this, 'EmbeddingQueueArn', {
      value: this.embeddingQueue.queueArn,
      description: 'ARN of the embedding generation queue',
      exportName: `${props.environment}-EmbeddingQueueArn`,
    });

    new cdk.CfnOutput(this, 'EmbeddingGeneratorFunctionName', {
      value: embeddingGenerator.functionName,
      description: 'Name of the embedding generator Lambda function',
      exportName: `${props.environment}-EmbeddingGeneratorFunctionName`,
    });

    new cdk.CfnOutput(this, 'TextractCompletionTopicArn', {
      value: this.textractCompletionTopic.topicArn,
      description: 'ARN of the Textract completion SNS topic',
      exportName: `${props.environment}-TextractCompletionTopicArn`,
    });

    new cdk.CfnOutput(this, 'TextractServiceRoleArn', {
      value: textractRole.roleArn,
      description: 'ARN of the Textract service role',
      exportName: `${props.environment}-TextractServiceRoleArn`,
    });

    new cdk.CfnOutput(this, 'TextractProcessorFunctionName', {
      value: textractProcessor.functionName,
      description: 'Name of the Textract processor Lambda function',
      exportName: `${props.environment}-TextractProcessorFunctionName`,
    });
  }
}