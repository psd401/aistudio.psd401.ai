import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';

export interface DatabaseStackProps extends cdk.StackProps {
  environment: 'dev' | 'prod';
}

export class DatabaseStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);

    // VPC with public and isolated subnets
    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: props.environment === 'prod' ? 3 : 2,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'isolated',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
    });

    // Security group for DB access
    const dbSg = new ec2.SecurityGroup(this, 'DbSecurityGroup', {
      vpc,
      description: 'Allow inbound PostgreSQL',
      allowAllOutbound: true,
    });
    dbSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(5432), 'Allow PostgreSQL access');

    // Secrets Manager secret for DB credentials
    const dbSecret = new secretsmanager.Secret(this, 'DbSecret', {
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'master' }),
        generateStringKey: 'password',
        excludePunctuation: true,
        includeSpace: false,
      },
    });

    // Aurora Serverless v2 cluster (using only writer/readers, no instances/instanceProps)
    const cluster = new rds.DatabaseCluster(this, 'AuroraCluster', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({ version: rds.AuroraPostgresEngineVersion.VER_15_3 }),
      credentials: rds.Credentials.fromSecret(dbSecret),
      defaultDatabaseName: 'aistudio',
      writer: rds.ClusterInstance.serverlessV2('Writer', {
        scaleWithWriter: true,
      }),
      readers: props.environment === 'prod'
        ? [rds.ClusterInstance.serverlessV2('Reader', {})]
        : [],
      serverlessV2MinCapacity: props.environment === 'prod' ? 2 : 0.5,
      serverlessV2MaxCapacity: props.environment === 'prod' ? 8 : 2,
      storageEncrypted: true,
      backup: {
        retention: cdk.Duration.days(props.environment === 'prod' ? 7 : 1),
      },
      removalPolicy: props.environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      deletionProtection: props.environment === 'prod',
      cloudwatchLogsExports: ['postgresql'],
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [dbSg],
      enableDataApi: true,
    });

    // RDS Proxy
    const proxy = cluster.addProxy('RdsProxy', {
      secrets: [dbSecret],
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroups: [dbSg],
      requireTLS: true,
      debugLogging: props.environment !== 'prod',
    });

    // Outputs
    new cdk.CfnOutput(this, 'RdsProxyEndpoint', {
      value: proxy.endpoint,
      description: 'RDS Proxy endpoint',
      exportName: `${props.environment}-RdsProxyEndpoint`,
    });
    new cdk.CfnOutput(this, 'DbSecretArn', {
      value: dbSecret.secretArn,
      description: 'Secrets Manager ARN for DB credentials',
      exportName: `${props.environment}-DbSecretArn`,
    });
  }
}
