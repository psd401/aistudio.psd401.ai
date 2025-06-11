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

    const subdomain = props.environment === 'dev' ? `dev.${props.baseDomain}` : `prod.${props.baseDomain}`;

    // Amplify App
    const amplifyApp = new amplify.App(this, 'AmplifyApp', {
      appName: `aistudio-${props.environment}`,
      sourceCodeProvider: new amplify.GitHubSourceCodeProvider({
        owner: 'psd401',
        repository: 'aistudio.psd401.ai',
        oauthToken: props.githubToken,
      }),
      environmentVariables: {
        DATABASE_URL: 'PLACEHOLDER',
        NEXT_PUBLIC_COGNITO_USER_POOL_ID: 'PLACEHOLDER',
        NEXT_PUBLIC_COGNITO_CLIENT_ID: 'PLACEHOLDER',
        NEXT_PUBLIC_COGNITO_DOMAIN: 'PLACEHOLDER',
        // Add other secrets as needed
      },
      autoBranchDeletion: true,
    });

    // Branches
    const branchName = props.environment === 'prod' ? 'main' : 'develop';
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
