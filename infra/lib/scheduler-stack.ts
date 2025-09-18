import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as scheduler from 'aws-cdk-lib/aws-scheduler';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as path from 'path';

export interface SchedulerStackProps extends cdk.StackProps {
  environment: 'dev' | 'prod';
  // Cross-stack dependencies retrieved from SSM Parameter Store
  databaseResourceArn?: string;
  databaseSecretArn?: string;
}

export class SchedulerStack extends cdk.Stack {
  public readonly scheduleExecutorFunction: lambda.Function;
  public readonly scheduleExecutorRole: iam.Role;
  public readonly schedulerExecutionRole: iam.Role;
  public readonly deadLetterQueue: sqs.Queue;

  constructor(scope: Construct, id: string, props: SchedulerStackProps) {
    super(scope, id, props);

    // Retrieve values from SSM Parameter Store (or use provided props for backward compatibility)
    const databaseResourceArn = props.databaseResourceArn ||
      ssm.StringParameter.valueForStringParameter(
        this, `/aistudio/${props.environment}/db-cluster-arn`
      );

    const databaseSecretArn = props.databaseSecretArn ||
      ssm.StringParameter.valueForStringParameter(
        this, `/aistudio/${props.environment}/db-secret-arn`
      );

    // Dead Letter Queue for failed schedule executions
    this.deadLetterQueue = new sqs.Queue(this, 'ScheduleExecutionDLQ', {
      queueName: `aistudio-${props.environment}-schedule-execution-dlq`,
      retentionPeriod: cdk.Duration.days(14),
    });

    // CloudWatch Log Group for scheduler executions
    const scheduleExecutorLogGroup = new logs.LogGroup(this, 'ScheduleExecutorLogGroup', {
      logGroupName: `/aws/lambda/aistudio-${props.environment}-schedule-executor`,
      retention: props.environment === 'prod' ? logs.RetentionDays.ONE_MONTH : logs.RetentionDays.ONE_WEEK,
      removalPolicy: props.environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // Lambda function for executing scheduled tasks
    this.scheduleExecutorFunction = new lambda.Function(this, 'ScheduleExecutor', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambdas/schedule-executor')),
      functionName: `aistudio-${props.environment}-schedule-executor`,
      timeout: cdk.Duration.minutes(15), // Full Lambda timeout for long-running Assistant Architect executions
      memorySize: 2048, // 2GB for AI SDK operations
      environment: {
        NODE_OPTIONS: '--enable-source-maps',
        DATABASE_RESOURCE_ARN: databaseResourceArn,
        DATABASE_SECRET_ARN: databaseSecretArn,
        DATABASE_NAME: 'aistudio',
        ENVIRONMENT: props.environment,
        DLQ_URL: this.deadLetterQueue.queueUrl,
        SCHEDULER_EXECUTION_ROLE_ARN: '', // Will be set after role creation
      },
      logGroup: scheduleExecutorLogGroup,
      // Concurrency limits to prevent overwhelming the system
      reservedConcurrentExecutions: props.environment === 'prod' ? 10 : 5,
    });

    // IAM Role for EventBridge Scheduler to invoke Lambda
    this.schedulerExecutionRole = new iam.Role(this, 'SchedulerExecutionRole', {
      roleName: `aistudio-${props.environment}-scheduler-execution-role`,
      assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com'),
      description: 'Role for EventBridge Scheduler to invoke schedule executor Lambda',
    });

    // Grant EventBridge Scheduler permission to invoke the Lambda function
    this.scheduleExecutorFunction.grantInvoke(this.schedulerExecutionRole);

    // IAM Role for the Lambda function
    this.scheduleExecutorRole = this.scheduleExecutorFunction.role as iam.Role;

    // Grant RDS Data API permissions to Lambda
    const rdsDataApiPolicy = new iam.PolicyStatement({
      actions: [
        'rds-data:ExecuteStatement',
        'rds-data:BatchExecuteStatement',
        'rds-data:BeginTransaction',
        'rds-data:CommitTransaction',
        'rds-data:RollbackTransaction',
      ],
      resources: [databaseResourceArn],
    });

    const secretsManagerPolicy = new iam.PolicyStatement({
      actions: ['secretsmanager:GetSecretValue'],
      resources: [databaseSecretArn],
    });

    this.scheduleExecutorFunction.addToRolePolicy(rdsDataApiPolicy);
    this.scheduleExecutorFunction.addToRolePolicy(secretsManagerPolicy);

    // Grant EventBridge Scheduler management permissions to Lambda (for schedule CRUD operations)
    const schedulerManagementPolicy = new iam.PolicyStatement({
      actions: [
        'scheduler:CreateSchedule',
        'scheduler:GetSchedule',
        'scheduler:UpdateSchedule',
        'scheduler:DeleteSchedule',
        'scheduler:ListSchedules',
      ],
      resources: [
        `arn:aws:scheduler:${this.region}:${this.account}:schedule/aistudio-${props.environment}/*`,
      ],
    });

    this.scheduleExecutorFunction.addToRolePolicy(schedulerManagementPolicy);

    // Grant access to AI provider configurations (SSM Parameter Store)
    const ssmParameterPolicy = new iam.PolicyStatement({
      actions: [
        'ssm:GetParameter',
        'ssm:GetParameters',
        'ssm:GetParametersByPath',
      ],
      resources: [
        `arn:aws:ssm:${this.region}:${this.account}:parameter/aistudio/${props.environment}/providers/*`,
        `arn:aws:ssm:${this.region}:${this.account}:parameter/aistudio/${props.environment}/openai/*`,
        `arn:aws:ssm:${this.region}:${this.account}:parameter/aistudio/${props.environment}/google/*`,
        `arn:aws:ssm:${this.region}:${this.account}:parameter/aistudio/${props.environment}/azure/*`,
        `arn:aws:ssm:${this.region}:${this.account}:parameter/aistudio/${props.environment}/bedrock/*`,
      ],
    });
    this.scheduleExecutorFunction.addToRolePolicy(ssmParameterPolicy);

    // Grant Bedrock access for AWS-hosted models
    const bedrockPolicy = new iam.PolicyStatement({
      actions: [
        'bedrock:InvokeModel',
        'bedrock:InvokeModelWithResponseStream',
      ],
      resources: ['*'], // Bedrock model ARNs vary by region
    });
    this.scheduleExecutorFunction.addToRolePolicy(bedrockPolicy);

    // Grant SQS permissions for DLQ
    this.deadLetterQueue.grantSendMessages(this.scheduleExecutorFunction);

    // Update environment with scheduler execution role ARN
    this.scheduleExecutorFunction.addEnvironment('SCHEDULER_EXECUTION_ROLE_ARN', this.schedulerExecutionRole.roleArn);
    this.scheduleExecutorFunction.addEnvironment('SCHEDULE_EXECUTOR_FUNCTION_ARN', this.scheduleExecutorFunction.functionArn);

    // Store the executor function ARN in SSM for API access
    new ssm.StringParameter(this, 'ScheduleExecutorFunctionArnParam', {
      parameterName: `/aistudio/${props.environment}/schedule-executor-function-arn`,
      stringValue: this.scheduleExecutorFunction.functionArn,
      description: 'ARN of the schedule executor Lambda function',
    });

    // Store the scheduler execution role ARN in SSM for schedule creation
    new ssm.StringParameter(this, 'SchedulerExecutionRoleArnParam', {
      parameterName: `/aistudio/${props.environment}/scheduler-execution-role-arn`,
      stringValue: this.schedulerExecutionRole.roleArn,
      description: 'ARN of the EventBridge Scheduler execution role',
    });

    // Outputs
    new cdk.CfnOutput(this, 'ScheduleExecutorFunctionNameOutput', {
      value: this.scheduleExecutorFunction.functionName,
      description: 'Name of the schedule executor Lambda function',
      exportName: `${props.environment}-ScheduleExecutorFunctionName`,
    });

    new cdk.CfnOutput(this, 'ScheduleExecutorFunctionArnOutput', {
      value: this.scheduleExecutorFunction.functionArn,
      description: 'ARN of the schedule executor Lambda function',
      exportName: `${props.environment}-ScheduleExecutorFunctionArn`,
    });

    new cdk.CfnOutput(this, 'SchedulerExecutionRoleArnOutput', {
      value: this.schedulerExecutionRole.roleArn,
      description: 'ARN of the EventBridge Scheduler execution role',
      exportName: `${props.environment}-SchedulerExecutionRoleArn`,
    });

    new cdk.CfnOutput(this, 'ScheduleExecutionDLQUrl', {
      value: this.deadLetterQueue.queueUrl,
      description: 'URL of the schedule execution dead letter queue',
      exportName: `${props.environment}-ScheduleExecutionDLQUrl`,
    });

    new cdk.CfnOutput(this, 'ScheduleExecutionDLQArn', {
      value: this.deadLetterQueue.queueArn,
      description: 'ARN of the schedule execution dead letter queue',
      exportName: `${props.environment}-ScheduleExecutionDLQArn`,
    });
  }
}