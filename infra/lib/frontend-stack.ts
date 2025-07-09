import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as amplify from '@aws-cdk/aws-amplify-alpha';
import * as amplifyL1 from 'aws-cdk-lib/aws-amplify';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cr from 'aws-cdk-lib/custom-resources';

export interface FrontendStackProps extends cdk.StackProps {
  environment: 'dev' | 'prod';
  githubToken: cdk.SecretValue;
  baseDomain: string;
}

export class FrontendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    // Keep the existing L2 construct to avoid recreating the app
    const amplifyApp = new amplify.App(this, 'AmplifyApp', {
      appName: `aistudio-${props.environment}`,
      sourceCodeProvider: new amplify.GitHubSourceCodeProvider({
        owner: 'psd401',
        repository: 'aistudio.psd401.ai',
        oauthToken: props.githubToken,
      }),
      platform: amplify.Platform.WEB_COMPUTE,
      autoBranchDeletion: true,
      buildSpec: codebuild.BuildSpec.fromObject({
        version: 1,
        applications: [{
          frontend: {
            phases: {
              preBuild: {
                commands: [
                  'npm ci --legacy-peer-deps'
                ]
              },
              build: {
                commands: [
                  'env | grep -E "^AUTH_|^NEXT_PUBLIC_|^RDS_|^SQL_" >> .env',
                  'npm run build'
                ]
              }
            },
            artifacts: {
              baseDirectory: '.next',
              files: ['**/*']
            },
            cache: {
              paths: [
                'node_modules/**/*',
                '.next/cache/**/*'
              ]
            }
          }
        }]
      })
    });

    // Branches
    const branchName = props.environment === 'prod' ? 'main' : 'dev';
    const branch = amplifyApp.addBranch(branchName);

    // Create SSR Compute Role
    const ssrComputeRole = new iam.Role(this, 'SSRComputeRole', {
      assumedBy: new iam.ServicePrincipal('amplify.amazonaws.com'),
      description: `SSR Compute role for Amplify app ${props.environment}`,
      roleName: `amplify-ssr-compute-${props.environment}-${cdk.Stack.of(this).account}`,
      inlinePolicies: {
        'RDSDataAPIAccess': new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'rds-data:ExecuteStatement',
                'rds-data:BatchExecuteStatement',
                'rds-data:BeginTransaction',
                'rds-data:CommitTransaction',
                'rds-data:RollbackTransaction'
              ],
              resources: ['*']
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'secretsmanager:GetSecretValue',
                'secretsmanager:DescribeSecret'
              ],
              resources: ['*']
            })
          ]
        })
      }
    });

    // Create service role
    const amplifyRole = new iam.Role(this, 'AmplifyServiceRole', {
      assumedBy: new iam.ServicePrincipal('amplify.amazonaws.com'),
      description: `Service role for Amplify app ${props.environment}`,
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess-Amplify')
      ]
    });

    // Add RDS permissions to service role too
    amplifyRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'rds-data:ExecuteStatement',
        'rds-data:BatchExecuteStatement',
        'rds-data:BeginTransaction',
        'rds-data:CommitTransaction',
        'rds-data:RollbackTransaction'
      ],
      resources: ['*']
    }));

    amplifyRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'secretsmanager:GetSecretValue',
        'secretsmanager:DescribeSecret'
      ],
      resources: ['*']
    }));

    // Override the service role
    const cfnApp = amplifyApp.node.defaultChild as amplifyL1.CfnApp;
    cfnApp.iamServiceRole = amplifyRole.roleArn;

    // Use Custom Resource to update the existing app with compute role
    const updateAppComputeRole = new cr.AwsCustomResource(this, 'UpdateAppComputeRole', {
      onCreate: {
        service: 'Amplify',
        action: 'updateApp',
        parameters: {
          appId: amplifyApp.appId,
          computeRoleArn: ssrComputeRole.roleArn
        },
        physicalResourceId: cr.PhysicalResourceId.of(`${amplifyApp.appId}-compute-role-update`)
      },
      onUpdate: {
        service: 'Amplify',
        action: 'updateApp',
        parameters: {
          appId: amplifyApp.appId,
          computeRoleArn: ssrComputeRole.roleArn
        }
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['amplify:UpdateApp', 'amplify:GetApp'],
          resources: [`arn:aws:amplify:${this.region}:${this.account}:apps/*`]
        }),
        new iam.PolicyStatement({
          actions: ['iam:PassRole'],
          resources: [ssrComputeRole.roleArn],
          conditions: {
            StringEquals: {
              'iam:PassedToService': 'amplify.amazonaws.com'
            }
          }
        })
      ])
    });

    // Ensure custom resource runs after the app exists
    updateAppComputeRole.node.addDependency(amplifyApp);
    updateAppComputeRole.node.addDependency(ssrComputeRole);

    // Add domain
    amplifyApp.addDomain(props.baseDomain, { 
      subDomains: [{ 
        branch, 
        prefix: props.environment 
      }] 
    });

    // Outputs
    new cdk.CfnOutput(this, 'AmplifyAppId', {
      value: amplifyApp.appId,
      description: 'Amplify App ID',
      exportName: `${props.environment}-AmplifyAppId`,
    });
    new cdk.CfnOutput(this, 'AmplifyDefaultDomain', {
      value: amplifyApp.defaultDomain,
      description: 'Amplify Default Domain',
      exportName: `${props.environment}-AmplifyDefaultDomain`,
    });
    new cdk.CfnOutput(this, 'SSRComputeRoleArn', {
      value: ssrComputeRole.roleArn,
      description: 'SSR Compute Role ARN',
      exportName: `${props.environment}-SSRComputeRoleArn`,
    });

    // Environment variables instructions
    new cdk.CfnOutput(this, 'EnvironmentVariablesInstructions', {
      value: `After deployment, set the following environment variables in the AWS Amplify console:
      AUTH_URL=https://${props.environment}.${props.baseDomain}
      AUTH_SECRET=<generate with: openssl rand -base64 32>
      AUTH_COGNITO_CLIENT_ID=<from auth stack>
      AUTH_COGNITO_ISSUER=https://cognito-idp.${this.region}.amazonaws.com/<user-pool-id from auth stack>
      NEXT_PUBLIC_COGNITO_USER_POOL_ID=<from auth stack>
      NEXT_PUBLIC_COGNITO_CLIENT_ID=<from auth stack>
      NEXT_PUBLIC_COGNITO_DOMAIN=<from auth stack>
      NEXT_PUBLIC_AWS_REGION=${this.region}
      RDS_RESOURCE_ARN=<from database stack>
      RDS_SECRET_ARN=<from database stack>
      SQL_LOGGING=false`,
      description: 'Required environment variables for Amplify app'
    });
  }
}