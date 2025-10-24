import * as cdk from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export interface GravitonTaskDefinitionProps {
  environment: 'dev' | 'prod';
  containerImage: ecs.ContainerImage;
  taskRole: iam.IRole;
  executionRole: iam.IRole;
  containerEnvironment: { [key: string]: string };
  containerSecrets: { [key: string]: ecs.Secret };
  logGroup: logs.ILogGroup;
  enableXRay?: boolean;
  cpu?: number;
  memoryLimitMiB?: number;
}

/**
 * Graviton2-optimized task definition for ARM64 workloads.
 * Provides better price/performance ratio with ARM64 architecture.
 */
export class GravitonTaskDefinition extends Construct {
  public readonly taskDefinition: ecs.FargateTaskDefinition;
  public readonly container: ecs.ContainerDefinition;

  constructor(scope: Construct, id: string, props: GravitonTaskDefinitionProps) {
    super(scope, id);

    const { environment } = props;

    // Right-sized CPU/Memory based on profiling and environment
    const cpuMemoryConfig = this.getRightSizedConfig(
      environment,
      props.cpu,
      props.memoryLimitMiB
    );

    this.taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDef', {
      cpu: cpuMemoryConfig.cpu,
      memoryLimitMiB: cpuMemoryConfig.memory,

      // Graviton2 (ARM64) for better price/performance (40% improvement)
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.ARM64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },

      // Ephemeral storage for better performance
      ephemeralStorageGiB: environment === 'prod' ? 30 : 21,

      // IAM roles
      executionRole: props.executionRole,
      taskRole: props.taskRole,

      // Volumes for read-only filesystem
      volumes: [
        {
          name: 'tmp',
        },
        {
          name: 'nextjs-cache',
        },
        {
          name: 'nextjs-home',
        },
      ],
    });

    // ARM64-optimized environment variables for Node.js
    const optimizedEnv = {
      ...props.containerEnvironment,
      // Node.js memory optimization - 70% of container memory
      NODE_OPTIONS: `--max-old-space-size=${Math.floor(cpuMemoryConfig.memory * 0.7)}`,
      // UV thread pool size optimized for ARM64 cores
      UV_THREADPOOL_SIZE: '8',
      // Reduce memory fragmentation on ARM64
      MALLOC_ARENA_MAX: '2',
      // Better memory release
      GODEBUG: 'madvdontneed=1',
    };

    // Main application container
    this.container = this.taskDefinition.addContainer('app', {
      containerName: 'nextjs-app',
      image: props.containerImage,
      memoryLimitMiB: cpuMemoryConfig.memory,
      memoryReservationMiB: Math.floor(cpuMemoryConfig.memory * 0.8), // Soft limit
      cpu: cpuMemoryConfig.cpu,

      // ARM64-optimized environment
      environment: optimizedEnv,
      secrets: props.containerSecrets,

      // Health check
      healthCheck: {
        command: ['CMD-SHELL', 'curl -f http://localhost:3000/api/healthz || exit 1'],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(60),
      },

      // Logging with non-blocking mode for better performance
      logging: ecs.LogDrivers.awsLogs({
        logGroup: props.logGroup,
        streamPrefix: 'app',
        mode: ecs.AwsLogDriverMode.NON_BLOCKING,
        maxBufferSize: cdk.Size.mebibytes(25),
      }),

      // Container insights labels
      dockerLabels: {
        'com.amazonaws.ecs.metrics.collection': 'enabled',
      },

      // Security: Read-only root filesystem
      readonlyRootFilesystem: true,

      // Init process for proper signal handling (graceful shutdown)
      linuxParameters: new ecs.LinuxParameters(this, 'LinuxParameters', {
        initProcessEnabled: true, // Critical for graceful shutdown
      }),

      // File descriptor limits
      ulimits: [
        {
          name: ecs.UlimitName.NOFILE,
          softLimit: 65536,
          hardLimit: 65536,
        },
      ],

      portMappings: [{
        containerPort: 3000,
        protocol: ecs.Protocol.TCP,
        name: 'http',
      }],
    });

    // Add mount points for writable directories in read-only filesystem
    this.container.addMountPoints({
      containerPath: '/tmp',
      sourceVolume: 'tmp',
      readOnly: false,
    });
    this.container.addMountPoints({
      containerPath: '/app/.next/cache',
      sourceVolume: 'nextjs-cache',
      readOnly: false,
    });
    this.container.addMountPoints({
      containerPath: '/home/nextjs',
      sourceVolume: 'nextjs-home',
      readOnly: false,
    });

    // Add X-Ray sidecar for tracing in production
    if (props.enableXRay !== false && environment === 'prod') {
      this.addXRaySidecar(props.logGroup);
    }
  }

  /**
   * Get right-sized CPU and memory configuration based on environment and overrides
   */
  private getRightSizedConfig(
    environment: string,
    cpuOverride?: number,
    memoryOverride?: number
  ): { cpu: number; memory: number } {
    // If overrides provided, use them
    if (cpuOverride !== undefined && memoryOverride !== undefined) {
      return { cpu: cpuOverride, memory: memoryOverride };
    }

    // Based on actual profiling data and environment requirements
    const configs: Record<string, { cpu: number; memory: number }> = {
      dev: { cpu: 512, memory: 1024 },    // 0.5 vCPU, 1 GB
      prod: { cpu: 1024, memory: 2048 },  // 1 vCPU, 2 GB
    };

    return configs[environment] || configs.dev;
  }

  /**
   * Add X-Ray daemon sidecar for distributed tracing
   */
  private addXRaySidecar(logGroup: logs.ILogGroup): void {
    this.taskDefinition.addContainer('xray', {
      containerName: 'xray-daemon',
      image: ecs.ContainerImage.fromRegistry('public.ecr.aws/xray/aws-xray-daemon:latest'),
      cpu: 32,
      memoryLimitMiB: 256,
      essential: false, // Don't crash the task if X-Ray fails
      portMappings: [{
        containerPort: 2000,
        protocol: ecs.Protocol.UDP,
      }],
      logging: ecs.LogDrivers.awsLogs({
        logGroup,
        streamPrefix: 'xray',
      }),
    });

    // Grant X-Ray permissions to task role
    this.taskDefinition.taskRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AWSXRayDaemonWriteAccess')
    );
  }
}
