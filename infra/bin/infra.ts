#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { InfraStack } from '../lib/infra-stack';
import { DatabaseStack } from '../lib/database-stack';
import { AuthStack } from '../lib/auth-stack';
import { StorageStack } from '../lib/storage-stack';
import { FrontendStack } from '../lib/frontend-stack';
import { SecretValue } from 'aws-cdk-lib';

const app = new cdk.App();

// Standard tags for cost allocation
const standardTags = {
  Project: 'AIStudio',
  Owner: 'TSD Engineering',
};

// Get baseDomain from context first
const baseDomain = app.node.tryGetContext('baseDomain');

// Helper to get callback/logout URLs for any environment
function getCallbackAndLogoutUrls(environment: string, baseDomain?: string): { callbackUrls: string[], logoutUrls: string[] } {
  if (environment === 'dev') {
    return {
      callbackUrls: [
        'http://localhost:3000/',
        'http://localhost:3001/',
        'http://localhost:3000/api/auth/callback/cognito',
        'http://localhost:3001/api/auth/callback/cognito',
        baseDomain ? `https://dev.${baseDomain}/` : undefined,
        baseDomain ? `https://dev.${baseDomain}/api/auth/callback/cognito` : undefined,
      ].filter(Boolean) as string[],
      logoutUrls: [
        'http://localhost:3000/',
        'http://localhost:3001/',
        'http://localhost:3000/oauth2/idpresponse',
        'http://localhost:3001/oauth2/idpresponse',
        baseDomain ? `https://dev.${baseDomain}/` : undefined,
        baseDomain ? `https://dev.${baseDomain}/oauth2/idpresponse` : undefined,
      ].filter(Boolean) as string[],
    };
  } else {
    return {
      callbackUrls: [
        baseDomain ? `https://prod.${baseDomain}/` : undefined,
        baseDomain ? `https://dev.${baseDomain}/` : undefined,
        baseDomain ? `https://prod.${baseDomain}/api/auth/callback/cognito` : undefined,
        baseDomain ? `https://dev.${baseDomain}/api/auth/callback/cognito` : undefined,
      ].filter(Boolean) as string[],
      logoutUrls: [
        baseDomain ? `https://prod.${baseDomain}/` : undefined,
        baseDomain ? `https://dev.${baseDomain}/` : undefined,
        baseDomain ? `https://prod.${baseDomain}/oauth2/idpresponse` : undefined,
        baseDomain ? `https://dev.${baseDomain}/oauth2/idpresponse` : undefined,
      ].filter(Boolean) as string[],
    };
  }
}

// Dev environment
const devDbStack = new DatabaseStack(app, 'AIStudio-DatabaseStack-Dev', {
  environment: 'dev',
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});
cdk.Tags.of(devDbStack).add('Environment', 'Dev');
Object.entries(standardTags).forEach(([key, value]) => cdk.Tags.of(devDbStack).add(key, value));

const devUrls = getCallbackAndLogoutUrls('dev', baseDomain);
const devAuthStack = new AuthStack(app, 'AIStudio-AuthStack-Dev', {
  environment: 'dev',
  googleClientSecret: SecretValue.secretsManager('aistudio-dev-google-oauth', { jsonField: 'clientSecret' }),
  callbackUrls: devUrls.callbackUrls,
  logoutUrls: devUrls.logoutUrls,
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});
cdk.Tags.of(devAuthStack).add('Environment', 'Dev');
Object.entries(standardTags).forEach(([key, value]) => cdk.Tags.of(devAuthStack).add(key, value));

const devStorageStack = new StorageStack(app, 'AIStudio-StorageStack-Dev', {
  environment: 'dev',
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});
cdk.Tags.of(devStorageStack).add('Environment', 'Dev');
Object.entries(standardTags).forEach(([key, value]) => cdk.Tags.of(devStorageStack).add(key, value));

// Remove the isSynthOrDeploy conditional and always instantiate FrontendStack(s) if baseDomain is present
if (baseDomain) {
  const devFrontendStack = new FrontendStack(app, 'AIStudio-FrontendStack-Dev', {
    environment: 'dev',
    githubToken: SecretValue.secretsManager('aistudio-github-token'),
    baseDomain,
    env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
  });
  cdk.Tags.of(devFrontendStack).add('Environment', 'Dev');
  Object.entries(standardTags).forEach(([key, value]) => cdk.Tags.of(devFrontendStack).add(key, value));

  const prodFrontendStack = new FrontendStack(app, 'AIStudio-FrontendStack-Prod', {
    environment: 'prod',
    githubToken: SecretValue.secretsManager('aistudio-github-token'),
    baseDomain,
    env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
  });
  cdk.Tags.of(prodFrontendStack).add('Environment', 'Prod');
  Object.entries(standardTags).forEach(([key, value]) => cdk.Tags.of(prodFrontendStack).add(key, value));

  // To deploy, use:
  // cdk deploy AIStudio-FrontendStack-Dev --context baseDomain=yourdomain.com
  // cdk deploy AIStudio-FrontendStack-Prod --context baseDomain=yourdomain.com
}

// Prod environment
const prodDbStack = new DatabaseStack(app, 'AIStudio-DatabaseStack-Prod', {
  environment: 'prod',
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});
cdk.Tags.of(prodDbStack).add('Environment', 'Prod');
Object.entries(standardTags).forEach(([key, value]) => cdk.Tags.of(prodDbStack).add(key, value));

const prodUrls = getCallbackAndLogoutUrls('prod', baseDomain);
const prodAuthStack = new AuthStack(app, 'AIStudio-AuthStack-Prod', {
  environment: 'prod',
  googleClientSecret: SecretValue.secretsManager('aistudio-prod-google-oauth', { jsonField: 'clientSecret' }),
  callbackUrls: prodUrls.callbackUrls,
  logoutUrls: prodUrls.logoutUrls,
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});
cdk.Tags.of(prodAuthStack).add('Environment', 'Prod');
Object.entries(standardTags).forEach(([key, value]) => cdk.Tags.of(prodAuthStack).add(key, value));

const prodStorageStack = new StorageStack(app, 'AIStudio-StorageStack-Prod', {
  environment: 'prod',
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});
cdk.Tags.of(prodStorageStack).add('Environment', 'Prod');
Object.entries(standardTags).forEach(([key, value]) => cdk.Tags.of(prodStorageStack).add(key, value));

new InfraStack(app, 'AIStudio-InfraStack', {
  /* If you don't specify 'env', this stack will be environment-agnostic.
   * Account/Region-dependent features and context lookups will not work,
   * but a single synthesized template can be deployed anywhere. */

  /* Uncomment the next line to specialize this stack for the AWS Account
   * and Region that are implied by the current CLI configuration. */
  // env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },

  /* Uncomment the next line if you know exactly what Account and Region you
   * want to deploy the stack to. */
  // env: { account: '123456789012', region: 'us-east-1' },

  /* For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html */
});