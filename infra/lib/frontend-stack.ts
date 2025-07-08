import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as amplify from '@aws-cdk/aws-amplify-alpha';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as iam from 'aws-cdk-lib/aws-iam';

export interface FrontendStackProps extends cdk.StackProps {
  environment: 'dev' | 'prod';
  githubToken: cdk.SecretValue;
  baseDomain: string;
}

export class FrontendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);


    // Amplify App
    const amplifyApp = new amplify.App(this, 'AmplifyApp', {
      appName: `aistudio-${props.environment}`,
      sourceCodeProvider: new amplify.GitHubSourceCodeProvider({
        owner: 'psd401',
        repository: 'aistudio.psd401.ai',
        oauthToken: props.githubToken,
      }),
      platform: amplify.Platform.WEB_COMPUTE, // Required for Next.js SSR
      // Remove environmentVariables from here - they should be set manually after deployment
      // to avoid overwriting existing values on CDK updates
      autoBranchDeletion: true,
      buildSpec: codebuild.BuildSpec.fromObject({
        version: 1,
        frontend: {
          phases: {
            preBuild: {
              commands: [
                'npm ci --legacy-peer-deps'
              ]
            },
            build: {
              commands: [
                // Write all required environment variables to .env file
                // AWS-prefixed variables are not allowed in Amplify console, so we only use NEXT_PUBLIC_AWS_REGION
                'env | grep -E "^AUTH_|^NEXT_PUBLIC_|^RDS_|^SQL_" >> .env',
                // Build the Next.js application
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
      })
    });

    // Branches
    const branchName = props.environment === 'prod' ? 'main' : 'dev';
    const branch = amplifyApp.addBranch(branchName);

    // Grant permissions to access RDS Data API and Secrets Manager
    // Get the role from the Amplify app
    const amplifyRole = amplifyApp.node.findChild('Role') as iam.Role;
    
    // Add permissions for RDS Data API
    amplifyRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'rds-data:ExecuteStatement',
        'rds-data:BatchExecuteStatement',
        'rds-data:BeginTransaction',
        'rds-data:CommitTransaction',
        'rds-data:RollbackTransaction'
      ],
      resources: ['*'] // You could restrict this to specific cluster ARNs
    }));
    
    // Add permissions for Secrets Manager
    amplifyRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'secretsmanager:GetSecretValue',
        'secretsmanager:DescribeSecret'
      ],
      resources: ['*'] // You could restrict this to specific secret ARNs
    }));

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

    // Add custom domain using the correct Amplify CDK method
    amplifyApp.addDomain(props.baseDomain, { subDomains: [{ branch, prefix: props.environment }] });

    // Output instructions for setting environment variables
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
