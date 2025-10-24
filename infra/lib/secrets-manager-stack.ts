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

  protected defineResources(props: BaseStackProps): void {
    // Create SNS topic for alerts
    this.alertTopic = new sns.Topic(this, "SecretAlertTopic", {
      displayName: `${this.projectName} Secrets Manager Alerts - ${this.deploymentEnvironment}`,
      topicName: `${this.projectName}-${this.deploymentEnvironment}-secrets-alerts`,
    })

    // Add email subscription if alertEmail is provided
    if (props.alertEmail) {
      this.alertTopic.addSubscription(
        new subscriptions.EmailSubscription(props.alertEmail)
      )
    }

    // Create Secret Cache Lambda Layer
    this.secretCacheLayer = new SecretCacheLayer(this, "SecretCacheLayer", {
      description: `Secret cache layer for ${this.deploymentEnvironment} environment`,
      layerName: `${this.projectName}-${this.deploymentEnvironment}-secret-cache`,
    })

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
   * Add CloudFormation outputs for easy reference
   */
  private addStackOutputs(): void {
    // SecretCacheLayer construct already creates its own output with exportName

    new cdk.CfnOutput(this, "ComplianceDashboardUrl", {
      value: `https://console.aws.amazon.com/cloudwatch/deeplink.js?region=${this.region}#dashboards:name=${this.complianceAuditor.dashboard.dashboardName}`,
      description: "URL to Secrets Compliance Dashboard",
    })

    new cdk.CfnOutput(this, "AlertTopicArn", {
      value: this.alertTopic.topicArn,
      description: "SNS topic for secrets alerts",
      exportName: `${this.stackName}-AlertTopicArn`,
    })
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
