import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as path from 'path';

export interface ProcessingStackProps extends cdk.StackProps {
  environment: 'dev' | 'prod';
  documentsBucketName: string;
  databaseResourceArn: string;
  databaseSecretArn: string;
}

export class ProcessingStack extends cdk.Stack {
  public readonly fileProcessingQueue: sqs.Queue;
  public readonly jobStatusTable: dynamodb.Table;

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

    // Lambda Layer for shared dependencies
    const processingLayer = new lambda.LayerVersion(this, 'ProcessingLayer', {
      code: lambda.Code.fromAsset(path.join(__dirname, '../layers/processing')),
      compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
      description: 'Shared processing utilities and dependencies',
    });

    // File Processor Lambda
    const fileProcessor = new lambdaNodejs.NodejsFunction(this, 'FileProcessor', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      entry: path.join(__dirname, '../lambdas/file-processor/index.ts'),
      timeout: cdk.Duration.minutes(10),
      memorySize: 3072, // 3GB
      environment: {
        NODE_OPTIONS: '--enable-source-maps',
        DOCUMENTS_BUCKET: documentsBucket.bucketName,
        JOB_STATUS_TABLE: this.jobStatusTable.tableName,
        DATABASE_RESOURCE_ARN: props.databaseResourceArn,
        DATABASE_SECRET_ARN: props.databaseSecretArn,
        DATABASE_NAME: 'aistudio',
        ENVIRONMENT: props.environment,
      },
      layers: [processingLayer],
      bundling: {
        minify: false,
        sourceMap: true,
        externalModules: [
          'aws-sdk',
          '@aws-sdk/*',
        ],
      },
    });

    // URL Processor Lambda
    const urlProcessor = new lambdaNodejs.NodejsFunction(this, 'URLProcessor', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      entry: path.join(__dirname, '../lambdas/url-processor/index.ts'),
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
      bundling: {
        minify: false,
        sourceMap: true,
        externalModules: [
          'aws-sdk',
          '@aws-sdk/*',
        ],
      },
    });

    // Grant permissions
    documentsBucket.grantRead(fileProcessor);
    this.jobStatusTable.grantReadWriteData(fileProcessor);
    this.jobStatusTable.grantReadWriteData(urlProcessor);

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

    // SQS event source for file processor
    fileProcessor.addEventSource(new lambdaEventSources.SqsEventSource(this.fileProcessingQueue, {
      batchSize: 1, // Process one file at a time
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
  }
}