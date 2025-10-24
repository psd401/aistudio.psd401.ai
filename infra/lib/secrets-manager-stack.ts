import * as cdk from "aws-cdk-lib"
import { Construct } from "constructs"
import { BaseStack, BaseStackProps } from "./constructs/base/base-stack"
import {
  ManagedSecret,
  SecretType,
  ComplianceAuditor,
} from "./constructs/security"
import { SecretCacheLayer } from "./constructs/compute/secret-cache-layer"
import * as sns from "aws-cdk-lib/aws-sns"
import * as subscriptions from "aws-cdk-lib/aws-sns-subscriptions"

/**
 * Secrets Manager Stack
 *
 * Centralized secrets management with:
 * - Encrypted storage with KMS
 * - Automatic rotation
 * - Cross-region replication (production only)
 * - Compliance monitoring and auditing
 * - Lambda layer for efficient caching
 *
 * Architecture:
 * 1. ManagedSecret constructs for individual secrets
 * 2. SecretCacheLayer for Lambda performance optimization
 * 3. ComplianceAuditor for ongoing monitoring
 * 4. SNS alerting for rotation failures and compliance violations
 *
 * @example
 * ```typescript
 * new SecretsManagerStack(app, 'SecretsManagerStack', {
 *   deploymentEnvironment: 'prod',
 *   config: EnvironmentConfig.get('prod')
 * })
 * ```
 */
export class SecretsManagerStack extends BaseStack {
  public secretCacheLayer!: SecretCacheLayer
  public complianceAuditor!: ComplianceAuditor
  public alertTopic!: sns.Topic

  // Secret references for use by other stacks
  public databaseSecret?: ManagedSecret
  public readonly apiKeySecrets!: Map<string, ManagedSecret>

  protected defineResources(props: BaseStackProps): void {
    // Initialize secret references
    (this as any).apiKeySecrets = new Map<string, ManagedSecret>()

    // Create SNS topic for alerts
    this.alertTopic = new sns.Topic(this, "SecretAlertTopic", {
      displayName: `${this.projectName} Secrets Manager Alerts - ${this.deploymentEnvironment}`,
      topicName: `${this.projectName}-${this.deploymentEnvironment}-secrets-alerts`,
    })

    // Add email subscription if configured
    const securityEmail = process.env.SECURITY_ALERT_EMAIL || props.config.securityAlertEmail
    if (securityEmail) {
      this.alertTopic.addSubscription(
        new subscriptions.EmailSubscription(securityEmail)
      )
    } else if (this.deploymentEnvironment === "prod") {
      throw new Error(
        "SECURITY_ALERT_EMAIL is required for production deployments. " +
        "Set the SECURITY_ALERT_EMAIL environment variable or config.securityAlertEmail field."
      )
    }

    // Create Secret Cache Lambda Layer
    this.secretCacheLayer = new SecretCacheLayer(this, "SecretCacheLayer", {
      description: `Secret cache layer for ${this.deploymentEnvironment} environment`,
      layerName: `${this.projectName}-${this.deploymentEnvironment}-secret-cache`,
    })

    // Create example secrets (these would be customized for actual use)
    this.createExampleSecrets(props)

    // Create Compliance Auditor
    this.complianceAuditor = new ComplianceAuditor(this, "ComplianceAuditor", {
      config: props.config,
      deploymentEnvironment: this.deploymentEnvironment,
      projectName: this.projectName,
      alertTopic: this.alertTopic,
      maxSecretAge: this.deploymentEnvironment === "prod" ? 60 : 90,
    })

    // Add stack outputs
    this.addStackOutputs()
  }

  /**
   * Create example secrets to demonstrate the pattern
   * In production, customize these or create them on-demand
   */
  private createExampleSecrets(props: BaseStackProps): void {
    // Database master password secret
    // Note: In practice, this would be created with the database
    // and the secret ARN would be passed to the database construct
    const databaseSecret = new ManagedSecret(this, "DatabaseMasterSecret", {
      secretName: "database/master-password",
      description: "Master password for Aurora PostgreSQL cluster",
      secretType: SecretType.DATABASE,
      config: props.config,
      deploymentEnvironment: this.deploymentEnvironment,
      projectName: this.projectName,
      rotationEnabled: true,
      rotationSchedule: cdk.Duration.days(30),
      replicateToRegions: this.deploymentEnvironment === "prod" ? ["us-west-2"] : undefined,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          username: "postgres",
          host: "placeholder", // Would be set after database creation
          port: 5432,
          database: "postgres",
        }),
        generateStringKey: "password",
        excludePunctuation: true,
        passwordLength: 32,
      },
    })

    this.databaseSecret = databaseSecret

    // OpenAI API Key secret (if using OpenAI)
    const openaiSecret = new ManagedSecret(this, "OpenAIApiKey", {
      secretName: "api-keys/openai",
      description: "OpenAI API key for GPT models",
      secretType: SecretType.API_KEY,
      config: props.config,
      deploymentEnvironment: this.deploymentEnvironment,
      projectName: this.projectName,
      rotationEnabled: false, // Manual rotation for external API keys
      tags: {
        Service: "OpenAI",
        Purpose: "LLM Integration",
      },
    })

    this.apiKeySecrets.set("openai", openaiSecret)

    // AWS Bedrock doesn't need a secret as it uses IAM
    // But we can create a secret for other AI providers

    // Google Gemini API Key (if using Google)
    const geminiSecret = new ManagedSecret(this, "GeminiApiKey", {
      secretName: "api-keys/gemini",
      description: "Google Gemini API key",
      secretType: SecretType.API_KEY,
      config: props.config,
      deploymentEnvironment: this.deploymentEnvironment,
      projectName: this.projectName,
      rotationEnabled: false,
      tags: {
        Service: "Google",
        Purpose: "LLM Integration",
      },
    })

    this.apiKeySecrets.set("gemini", geminiSecret)

    // Azure OpenAI credentials (if using Azure)
    const azureSecret = new ManagedSecret(this, "AzureOpenAIKey", {
      secretName: "api-keys/azure-openai",
      description: "Azure OpenAI API credentials",
      secretType: SecretType.API_KEY,
      config: props.config,
      deploymentEnvironment: this.deploymentEnvironment,
      projectName: this.projectName,
      rotationEnabled: false,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          apiKey: "placeholder",
          endpoint: "placeholder.openai.azure.com",
        }),
        generateStringKey: "apiKey",
      },
      tags: {
        Service: "Azure",
        Purpose: "LLM Integration",
      },
    })

    this.apiKeySecrets.set("azure", azureSecret)

    // JWT Secret for NextAuth
    const jwtSecret = new ManagedSecret(this, "NextAuthJWTSecret", {
      secretName: "auth/nextauth-secret",
      description: "JWT secret for NextAuth session encryption",
      secretType: SecretType.CUSTOM,
      config: props.config,
      deploymentEnvironment: this.deploymentEnvironment,
      projectName: this.projectName,
      rotationEnabled: true,
      rotationSchedule: cdk.Duration.days(90),
      generateSecretString: {
        excludePunctuation: true,
        includeSpace: false,
        passwordLength: 64,
      },
      tags: {
        Service: "NextAuth",
        Purpose: "Authentication",
      },
    })

    this.apiKeySecrets.set("nextauth", jwtSecret)
  }

  /**
   * Add CloudFormation outputs for easy reference
   */
  private addStackOutputs(): void {
    new cdk.CfnOutput(this, "SecretCacheLayerArn", {
      value: this.secretCacheLayer.layer.layerVersionArn,
      description: "ARN of the Secret Cache Lambda Layer",
      exportName: `${this.stackName}-SecretCacheLayerArn`,
    })

    new cdk.CfnOutput(this, "ComplianceDashboardUrl", {
      value: `https://console.aws.amazon.com/cloudwatch/deeplink.js?region=${this.region}#dashboards:name=${this.complianceAuditor.dashboard.dashboardName}`,
      description: "URL to Secrets Compliance Dashboard",
    })

    new cdk.CfnOutput(this, "AlertTopicArn", {
      value: this.alertTopic.topicArn,
      description: "SNS topic for secrets alerts",
      exportName: `${this.stackName}-AlertTopicArn`,
    })

    if (this.databaseSecret) {
      new cdk.CfnOutput(this, "DatabaseSecretArn", {
        value: this.databaseSecret.secret.secretArn,
        description: "ARN of database master secret",
        exportName: `${this.stackName}-DatabaseSecretArn`,
      })
    }
  }

  /**
   * Helper method to create a new managed secret
   * Can be called by other stacks or constructs
   */
  public createSecret(
    id: string,
    secretName: string,
    secretType: SecretType,
    options?: {
      description?: string
      rotationEnabled?: boolean
      rotationSchedule?: cdk.Duration
      replicateToRegions?: string[]
      tags?: { [key: string]: string }
    }
  ): ManagedSecret {
    return new ManagedSecret(this, id, {
      secretName,
      secretType,
      description: options?.description,
      config: this.config,
      deploymentEnvironment: this.deploymentEnvironment,
      projectName: this.projectName,
      rotationEnabled: options?.rotationEnabled,
      rotationSchedule: options?.rotationSchedule,
      replicateToRegions: options?.replicateToRegions,
      tags: options?.tags,
    })
  }
}
