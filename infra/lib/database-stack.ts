import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as path from 'path';
import * as ssm from 'aws-cdk-lib/aws-ssm';

export interface DatabaseStackProps extends cdk.StackProps {
  environment: 'dev' | 'prod';
}

export class DatabaseStack extends cdk.Stack {
  public readonly databaseResourceArn: string;
  public readonly databaseSecretArn: string;
  
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
    
    // For development, allow PostgreSQL access from anywhere (you should restrict this to your IP)
    if (props.environment === 'dev') {
      dbSg.addIngressRule(
        ec2.Peer.anyIpv4(), 
        ec2.Port.tcp(5432), 
        'Allow PostgreSQL access from anywhere (DEV ONLY)'
      );
      // Better practice: restrict to your IP
      // dbSg.addIngressRule(ec2.Peer.ipv4('YOUR.IP.ADDRESS.HERE/32'), ec2.Port.tcp(5432), 'Allow PostgreSQL from my IP');
    } else {
      // Production: only allow from within VPC
      dbSg.addIngressRule(
        ec2.Peer.ipv4(vpc.vpcCidrBlock), 
        ec2.Port.tcp(5432), 
        'Allow PostgreSQL access from VPC'
      );
    }

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
        // Note: publiclyAccessible requires the DB to be in public subnets
        // We'll keep it in private subnets and use Data API instead
      }),
      readers: props.environment === 'prod'
        ? [rds.ClusterInstance.serverlessV2('Reader', {
            scaleWithWriter: true,
          })]
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

    // Database initialization Lambda
    // Note: Lambda doesn't need to be in VPC since it uses RDS Data API
    const dbInitLambda = new lambda.Function(this, 'DbInitLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../database/lambda'), {
        bundling: {
          image: lambda.Runtime.NODEJS_20_X.bundlingImage,
          command: [
            'bash', '-c',
            'npm install && npm run build && cp -r ../schema dist/ && cp -r dist/* /asset-output/'
          ],
          environment: {
            NPM_CONFIG_CACHE: '/tmp/.npm',
          },
          local: {
            tryBundle(outputDir: string) {
              try {
                const execSync = require('child_process').execSync;
                const lambdaDir = path.join(__dirname, '../database/lambda');
                
                // Run npm install and build
                execSync('npm install', { cwd: lambdaDir, stdio: 'inherit' });
                execSync('npm run build', { cwd: lambdaDir, stdio: 'inherit' });
                
                // Copy built files to output directory
                execSync(`cp -r ${path.join(lambdaDir, 'dist')}/* ${outputDir}/`, { stdio: 'inherit' });
                execSync(`cp -r ${path.join(__dirname, '../database/schema')} ${outputDir}/`, { stdio: 'inherit' });
                
                return true;
              } catch {
                // If local bundling fails, fall back to Docker
                return false;
              }
            },
          },
        },
      }),
      // Lambda doesn't need VPC access since it uses RDS Data API
      timeout: cdk.Duration.minutes(5),
      memorySize: 1024,
      environment: {
        NODE_OPTIONS: '--enable-source-maps',
      },
      logRetention: logs.RetentionDays.ONE_WEEK,
    });

    // Grant the Lambda permission to use the Data API
    cluster.grantDataApiAccess(dbInitLambda);
    dbSecret.grantRead(dbInitLambda);

    // Create Custom Resource Provider
    const dbInitProvider = new cr.Provider(this, 'DbInitProvider', {
      onEventHandler: dbInitLambda,
      logRetention: logs.RetentionDays.ONE_WEEK,
    });

    // Create Custom Resource
    const dbInit = new cdk.CustomResource(this, 'DbInit', {
      serviceToken: dbInitProvider.serviceToken,
      properties: {
        ClusterArn: cluster.clusterArn,
        SecretArn: dbSecret.secretArn,
        DatabaseName: 'aistudio',
        Environment: props.environment,
        // Add a timestamp to force update on stack updates if needed - v1.0.15
        Timestamp: new Date().toISOString(),
      },
    });

    // Ensure the database is created before initialization
    dbInit.node.addDependency(cluster);

    // Outputs
    new cdk.CfnOutput(this, 'RdsProxyEndpoint', {
      value: proxy.endpoint,
      description: 'RDS Proxy endpoint',
      exportName: `${props.environment}-RdsProxyEndpoint`,
    });
    
    new cdk.CfnOutput(this, 'ClusterEndpoint', {
      value: cluster.clusterEndpoint.hostname,
      description: 'Aurora cluster writer endpoint',
      exportName: `${props.environment}-ClusterEndpoint`,
    });
    
    new cdk.CfnOutput(this, 'ClusterReaderEndpoint', {
      value: cluster.clusterReadEndpoint.hostname,
      description: 'Aurora cluster reader endpoint',
      exportName: `${props.environment}-ClusterReaderEndpoint`,
    });
    
    // Store ARNs for use by other stacks
    this.databaseResourceArn = cluster.clusterArn;
    this.databaseSecretArn = dbSecret.secretArn;
    
    // Store values in SSM Parameter Store for cross-stack references
    new ssm.StringParameter(this, 'DbClusterArnParam', {
      parameterName: `/aistudio/${props.environment}/db-cluster-arn`,
      stringValue: cluster.clusterArn,
      description: 'Aurora cluster ARN for Data API',
    });
    
    new ssm.StringParameter(this, 'DbSecretArnParam', {
      parameterName: `/aistudio/${props.environment}/db-secret-arn`,
      stringValue: dbSecret.secretArn,
      description: 'Secrets Manager ARN for DB credentials',
    });
    
    // Keep CloudFormation outputs for backward compatibility and monitoring
    new cdk.CfnOutput(this, 'ClusterArn', {
      value: cluster.clusterArn,
      description: 'Aurora cluster ARN for Data API',
      exportName: `${props.environment}-ClusterArn`,
    });
    
    new cdk.CfnOutput(this, 'DbSecretArn', {
      value: dbSecret.secretArn,
      description: 'Secrets Manager ARN for DB credentials',
      exportName: `${props.environment}-DbSecretArn`,
    });
  }
}
