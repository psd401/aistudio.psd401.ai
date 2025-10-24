import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

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

    // ADOT Collector for ECS as sidecar
    this.collectorTaskDefinition = new ecs.TaskDefinition(this, 'ADOTCollectorTask', {
      compatibility: ecs.Compatibility.FARGATE,
      cpu: '256',
      memoryMiB: '512',
      networkMode: ecs.NetworkMode.AWS_VPC,
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

    // Grant permissions to collector
    this.collectorTaskDefinition.addToTaskRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'xray:PutTraceSegments',
          'xray:PutTelemetryRecords',
          'cloudwatch:PutMetricData',
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:PutLogEvents',
          'logs:DescribeLogStreams',
        ],
        resources: ['*'],
      })
    );

    // Grant read access to config parameter
    this.collectorConfigParam.grantRead(this.collectorTaskDefinition.taskRole);

    // Output the layer ARN
    new cdk.CfnOutput(this, 'ADOTLayerArn', {
      value: this.lambdaLayer.layerVersionArn,
      description: 'ADOT Lambda Layer ARN',
      exportName: `${environment}-ADOTLayerArn`,
    });
  }

  /**
   * Instrument a Lambda function with ADOT
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

    // Grant X-Ray permissions
    func.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['xray:PutTraceSegments', 'xray:PutTelemetryRecords'],
        resources: ['*'],
      })
    );

    // Custom metrics via EMF
    func.addEnvironment('AWS_EMF_NAMESPACE', `AIStudio/${props.environment}`);
    func.addEnvironment('AWS_EMF_SERVICE_NAME', func.functionName);
  }

  /**
   * Instrument an ECS service with ADOT sidecar
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

    // Grant permissions to task role
    service.taskDefinition.addToTaskRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'xray:PutTraceSegments',
          'xray:PutTelemetryRecords',
          'cloudwatch:PutMetricData',
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:PutLogEvents',
        ],
        resources: ['*'],
      })
    );

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
