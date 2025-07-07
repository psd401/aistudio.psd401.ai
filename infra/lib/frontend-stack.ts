import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as amplify from '@aws-cdk/aws-amplify-alpha';

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
      environmentVariables: {
        // General
        AMPLIFY_APP_ORIGIN: 'PLACEHOLDER',
        
        // Auth
        NEXT_PUBLIC_COGNITO_USER_POOL_ID: 'PLACEHOLDER',
        NEXT_PUBLIC_COGNITO_CLIENT_ID: 'PLACEHOLDER',
        NEXT_PUBLIC_COGNITO_DOMAIN: 'PLACEHOLDER',
        NEXT_PUBLIC_AWS_REGION: 'PLACEHOLDER',
        COGNITO_JWKS_URL: 'PLACEHOLDER',
        
        // Database
        RDS_RESOURCE_ARN: 'PLACEHOLDER',
        RDS_SECRET_ARN: 'PLACEHOLDER'
      },
      autoBranchDeletion: true,
    });

    // Branches
    const branchName = props.environment === 'prod' ? 'main' : 'dev';
    const branch = amplifyApp.addBranch(branchName);

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
  }
}
