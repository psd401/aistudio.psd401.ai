import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { ServiceRoleFactory } from '../security';

export interface ADOTInstrumentationProps {
  environment: 'dev' | 'prod';
  version?: string;
  collectorConfig?: string;
}

export interface InstrumentLambdaProps {
  adotLayer: lambda.ILayerVersion;
  environment: 'dev' | 'prod';
  version?: string;
}

export interface InstrumentECSProps {
  cluster: ecs.ICluster;
  environment: 'dev' | 'prod';
}

/**
 * ADOT Instrumentation Construct
 * Provides ADOT layers and configuration for Lambda and ECS services
 */
export class ADOTInstrumentation extends Construct {
  public readonly lambdaLayer: lambda.ILayerVersion;
  public readonly collectorTaskDefinition: ecs.TaskDefinition;
  private readonly collectorConfigParam: ssm.StringParameter;

  constructor(scope: Construct, id: string, props: ADOTInstrumentationProps) {
    super(scope, id);

    const { environment } = props;

    // ADOT Lambda Layer for auto-instrumentation
    // Using AWS-managed layer ARN pattern
    this.lambdaLayer = lambda.LayerVersion.fromLayerVersionArn(
      this,
      'ADOTLayer',
      `arn:aws:lambda:${cdk.Stack.of(this).region}:901920570463:layer:aws-otel-nodejs-amd64-ver-1-18-1:4`
    );

    // Store collector configuration in SSM
    this.collectorConfigParam = new ssm.StringParameter(this, 'CollectorConfig', {
      parameterName: `/aistudio/${environment}/adot/config`,
      description: 'ADOT Collector configuration for AI Studio',
      stringValue: props.collectorConfig || this.getDefaultCollectorConfig(environment),
      tier: ssm.ParameterTier.STANDARD,
    });

    // Create IAM role for ADOT collector using ServiceRoleFactory
    const collectorRole = ServiceRoleFactory.createECSTaskRole(this, 'ADOTCollectorRole', {
      taskName: 'adot-collector',
      environment,
      region: cdk.Stack.of(this).region,
      account: cdk.Stack.of(this).account,
      additionalPolicies: [
        // X-Ray permissions (requires wildcard per AWS documentation)
        new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['xray:PutTraceSegments', 'xray:PutTelemetryRecords'],
              resources: ['*'], // X-Ray does not support resource-level permissions
            }),
          ],
        }),
        // CloudWatch Metrics permissions (requires wildcard per AWS documentation)
        new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['cloudwatch:PutMetricData'],
              resources: ['*'], // CloudWatch Metrics does not support resource-level permissions
            }),
          ],
        }),
        // CloudWatch Logs permissions (scoped to ADOT log groups)
        new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'logs:CreateLogGroup',
                'logs:CreateLogStream',
                'logs:PutLogEvents',
                'logs:DescribeLogStreams',
              ],
              resources: [
                `arn:aws:logs:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:log-group:/aws/aistudio/${environment}/traces:*`,
                `arn:aws:logs:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:log-group:/aws/ecs/adot-collector:*`,
              ],
            }),
          ],
        }),
      ],
    });

    // Grant read access to SSM parameter for collector config
    this.collectorConfigParam.grantRead(collectorRole);

    // ADOT Collector for ECS as sidecar
    this.collectorTaskDefinition = new ecs.TaskDefinition(this, 'ADOTCollectorTask', {
      compatibility: ecs.Compatibility.FARGATE,
      cpu: '256',
      memoryMiB: '512',
      networkMode: ecs.NetworkMode.AWS_VPC,
      taskRole: collectorRole, // Use ServiceRoleFactory-created role
    });

    this.collectorTaskDefinition.addContainer('ADOTCollector', {
      image: ecs.ContainerImage.fromRegistry('public.ecr.aws/aws-observability/aws-otel-collector:latest'),
      logging: new ecs.AwsLogDriver({
        streamPrefix: 'adot-collector',
        logRetention: logs.RetentionDays.ONE_WEEK,
      }),
      environment: {
        AWS_REGION: cdk.Stack.of(this).region,
        OTEL_RESOURCE_ATTRIBUTES: `service.namespace=aistudio,deployment.environment=${environment}`,
        AOT_CONFIG_CONTENT: this.collectorConfigParam.stringValue,
      },
      portMappings: [
        { containerPort: 4317, protocol: ecs.Protocol.TCP, name: 'grpc' },
        { containerPort: 4318, protocol: ecs.Protocol.TCP, name: 'http' },
        { containerPort: 2000, protocol: ecs.Protocol.UDP, name: 'statsd' },
      ],
    });

    // Output the layer ARN
    new cdk.CfnOutput(this, 'ADOTLayerArn', {
      value: this.lambdaLayer.layerVersionArn,
      description: 'ADOT Lambda Layer ARN',
      exportName: `${environment}-ADOTLayerArn`,
    });
  }

  /**
   * Instrument a Lambda function with ADOT
   *
   * NOTE: The Lambda function's execution role must already have X-Ray permissions.
   * When creating Lambda functions that need ADOT instrumentation, use ServiceRoleFactory.createLambdaRole()
   * which automatically includes X-Ray permissions.
   *
   * @param func - Lambda function to instrument
   * @param props - Instrumentation properties including ADOT layer
   */
  public instrumentLambda(func: lambda.Function, props: InstrumentLambdaProps): void {
    // Add ADOT layer
    func.addLayers(props.adotLayer);

    // Enable X-Ray tracing
    const cfnFunction = func.node.defaultChild as lambda.CfnFunction;
    cfnFunction.tracingConfig = {
      mode: lambda.Tracing.ACTIVE.toString(),
    };

    // Add environment variables for OTEL
    func.addEnvironment('OTEL_PROPAGATORS', 'tracecontext,baggage,xray');
    func.addEnvironment('OTEL_TRACES_EXPORTER', 'otlp');
    func.addEnvironment('OTEL_METRICS_EXPORTER', 'otlp');
    func.addEnvironment('OTEL_LOGS_EXPORTER', 'otlp');
    func.addEnvironment('OTEL_EXPORTER_OTLP_PROTOCOL', 'http/protobuf');
    func.addEnvironment('OTEL_EXPORTER_OTLP_ENDPOINT', 'http://localhost:4318');
    func.addEnvironment(
      'OTEL_RESOURCE_ATTRIBUTES',
      `service.name=${func.functionName},service.version=${props.version || '1.0.0'},deployment.environment=${props.environment}`
    );
    func.addEnvironment('AWS_LAMBDA_EXEC_WRAPPER', '/opt/otel-handler');

    // Custom metrics via EMF
    func.addEnvironment('AWS_EMF_NAMESPACE', `AIStudio/${props.environment}`);
    func.addEnvironment('AWS_EMF_SERVICE_NAME', func.functionName);

    // Note: X-Ray permissions are NOT added here - they must be included in the function's role
    // when created via ServiceRoleFactory.createLambdaRole() (which includes X-Ray by default)
  }

  /**
   * Instrument an ECS service with ADOT sidecar
   *
   * NOTE: The ECS task role must already have X-Ray and CloudWatch permissions.
   * When creating ECS services that need ADOT instrumentation, use ServiceRoleFactory.createECSTaskRole()
   * with appropriate observability policies included via additionalPolicies.
   *
   * @param service - ECS Fargate service to instrument
   * @param props - Instrumentation properties
   */
  public instrumentECSService(service: ecs.FargateService, props: InstrumentECSProps): void {
    // Add ADOT sidecar to the service's task definition
    service.taskDefinition.addContainer('adot-collector', {
      image: ecs.ContainerImage.fromRegistry('public.ecr.aws/aws-observability/aws-otel-collector:latest'),
      memoryLimitMiB: 256,
      cpu: 128,
      essential: false,
      logging: new ecs.AwsLogDriver({
        streamPrefix: 'adot',
        logRetention: logs.RetentionDays.ONE_WEEK,
      }),
      environment: {
        AOT_CONFIG_CONTENT: this.collectorConfigParam.stringValue,
      },
      portMappings: [
        { containerPort: 4317, protocol: ecs.Protocol.TCP },
        { containerPort: 4318, protocol: ecs.Protocol.TCP },
      ],
    });

    // Configure app container to send telemetry to sidecar
    const appContainer = service.taskDefinition.defaultContainer!;
    appContainer.addEnvironment('OTEL_EXPORTER_OTLP_ENDPOINT', 'http://localhost:4317');
    appContainer.addEnvironment('OTEL_SERVICE_NAME', service.serviceName);
    appContainer.addEnvironment(
      'OTEL_RESOURCE_ATTRIBUTES',
      `service.namespace=aistudio,deployment.environment=${props.environment}`
    );

    // Note: X-Ray, CloudWatch, and Logs permissions are NOT added here
    // They must be included in the task role when created via ServiceRoleFactory.createECSTaskRole()

    // Enable Container Insights on the cluster
    const cfnCluster = props.cluster.node.defaultChild as ecs.CfnCluster;
    cfnCluster.clusterSettings = [
      {
        name: 'containerInsights',
        value: 'enabled',
      },
    ];
  }

  /**
   * Get default ADOT collector configuration
   */
  private getDefaultCollectorConfig(environment: string): string {
    const region = cdk.Stack.of(this).region;

    return `
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318
  statsd:
    endpoint: 0.0.0.0:2000
    aggregation_interval: 60s
  awsecscontainermetrics:
    collection_interval: 10s

processors:
  batch:
    timeout: 10s
    send_batch_size: 100
  resource:
    attributes:
      - key: deployment.environment
        value: ${environment}
        action: upsert
      - key: cloud.provider
        value: aws
        action: insert
      - key: cloud.region
        value: ${region}
        action: insert
  filter:
    metrics:
      exclude:
        match_type: regexp
        metric_names:
          - .*_temp$
          - .*_test$
  memory_limiter:
    limit_mib: 400
    spike_limit_mib: 100
    check_interval: 5s

exporters:
  awsxray:
    region: ${region}
    no_verify_ssl: false
    local_mode: false
  awscloudwatch:
    namespace: AIStudio/${environment}
    region: ${region}
    dimension_rollup_option: NoDimensionRollup
    metric_declarations:
      - dimensions: [[service], [service, method], [service, method, status]]
        metric_name_selectors:
          - latency
          - error_rate
          - request_count
  awscloudwatchlogs:
    log_group_name: /aws/aistudio/${environment}/traces
    log_stream_name: otel-stream
    region: ${region}

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch, resource]
      exporters: [awsxray, awscloudwatchlogs]
    metrics:
      receivers: [otlp, statsd, awsecscontainermetrics]
      processors: [batch, resource, filter, memory_limiter]
      exporters: [awscloudwatch]
    logs:
      receivers: [otlp]
      processors: [batch, resource]
      exporters: [awscloudwatchlogs]
`;
  }
}
