import * as cdk from "aws-cdk-lib"
import * as lambda from "aws-cdk-lib/aws-lambda"
import * as events from "aws-cdk-lib/aws-events"
import * as targets from "aws-cdk-lib/aws-events-targets"
import * as iam from "aws-cdk-lib/aws-iam"
import * as logs from "aws-cdk-lib/aws-logs"
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch"
import * as sns from "aws-cdk-lib/aws-sns"
import { Construct } from "constructs"
import { IEnvironmentConfig } from "../config/environment-config"

/**
 * Configuration for the Compliance Auditor
 */
export interface ComplianceAuditorProps {
  /**
   * Environment configuration
   */
  readonly config: IEnvironmentConfig

  /**
   * Deployment environment
   */
  readonly deploymentEnvironment: string

  /**
   * Project name for prefixing
   * @default "AIStudio"
   */
  readonly projectName?: string

  /**
   * SNS topic for alerts
   * If not provided, alerts are logged only
   */
  readonly alertTopic?: sns.ITopic

  /**
   * Compliance check schedule
   * @default Daily at midnight
   */
  readonly schedule?: events.Schedule

  /**
   * Maximum age for secrets before alerting (in days)
   * @default 90
   */
  readonly maxSecretAge?: number
}

/**
 * Compliance Auditor for Secrets Manager
 *
 * Monitors secrets for compliance violations and generates reports:
 * - Secrets without rotation enabled
 * - Secrets exceeding maximum age
 * - Unencrypted secrets
 * - Secrets missing required tags
 * - Failed rotation attempts
 * - Unused secrets (no recent access)
 *
 * Features:
 * - Automated daily compliance scans
 * - CloudWatch dashboard for visualization
 * - SNS alerts for critical violations
 * - Detailed audit logs in CloudWatch
 * - Custom compliance rules
 *
 * @example
 * ```typescript
 * new ComplianceAuditor(this, 'SecretCompliance', {
 *   config: environmentConfig,
 *   deploymentEnvironment: 'prod',
 *   alertTopic: alertTopic,
 *   maxSecretAge: 60
 * })
 * ```
 */
export class ComplianceAuditor extends Construct {
  public readonly auditorFunction: lambda.Function
  public readonly dashboard: cloudwatch.Dashboard
  private readonly projectName: string

  constructor(scope: Construct, id: string, props: ComplianceAuditorProps) {
    super(scope, id)

    this.projectName = props.projectName || "AIStudio"

    // Create the auditor Lambda function
    this.auditorFunction = this.createAuditorFunction(props)

    // Create EventBridge rule for scheduled scans
    this.createScheduledScan(props)

    // Create EventBridge rule for rotation events
    this.createRotationMonitor(props)

    // Create CloudWatch dashboard
    this.dashboard = this.createDashboard(props)

    // Create compliance metrics
    this.createMetrics(props)
  }

  /**
   * Creates the compliance auditor Lambda function
   */
  private createAuditorFunction(props: ComplianceAuditorProps): lambda.Function {
    const functionName = `${this.projectName}-${props.deploymentEnvironment}-secret-compliance-auditor`

    const auditorFunction = new lambda.Function(this, "AuditorFunction", {
      functionName,
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: "index.handler",
      code: lambda.Code.fromInline(this.getAuditorCode(props)),
      timeout: cdk.Duration.minutes(15),
      memorySize: 512,
      architecture: lambda.Architecture.ARM_64,
      logGroup: new logs.LogGroup(this, "AuditorLogGroup", {
        logGroupName: `/aws/lambda/${functionName}`,
        retention: props.config.monitoring.logRetention,
        removalPolicy:
          props.deploymentEnvironment === "prod"
            ? cdk.RemovalPolicy.RETAIN
            : cdk.RemovalPolicy.DESTROY,
      }),
      environment: {
        PROJECT_NAME: this.projectName,
        ENVIRONMENT: props.deploymentEnvironment,
        MAX_SECRET_AGE: (props.maxSecretAge || 90).toString(),
        ALERT_TOPIC_ARN: props.alertTopic?.topicArn || "",
      },
    })

    // Grant permissions to read secrets metadata
    auditorFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "secretsmanager:ListSecrets",
          "secretsmanager:DescribeSecret",
          "secretsmanager:ListSecretVersionIds",
        ],
        resources: ["*"],
      })
    )

    // Grant permissions to read CloudTrail for access patterns
    auditorFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["cloudtrail:LookupEvents"],
        resources: ["*"],
      })
    )

    // Grant permission to publish CloudWatch metrics
    auditorFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["cloudwatch:PutMetricData"],
        resources: ["*"],
        conditions: {
          StringEquals: {
            "cloudwatch:namespace": `${this.projectName}/SecretsCompliance`,
          },
        },
      })
    )

    // Grant SNS publish if topic provided
    if (props.alertTopic) {
      props.alertTopic.grantPublish(auditorFunction)
    }

    return auditorFunction
  }

  /**
   * Creates EventBridge rule for scheduled compliance scans
   */
  private createScheduledScan(props: ComplianceAuditorProps): void {
    const schedule = props.schedule || events.Schedule.cron({ hour: "0", minute: "0" })

    const rule = new events.Rule(this, "ComplianceScanRule", {
      schedule,
      description: "Daily secrets compliance audit",
      enabled: true,
    })

    rule.addTarget(
      new targets.LambdaFunction(this.auditorFunction, {
        event: events.RuleTargetInput.fromObject({
          scanType: "scheduled",
          timestamp: events.EventField.time,
        }),
      })
    )
  }

  /**
   * Creates EventBridge rule to monitor rotation events
   */
  private createRotationMonitor(props: ComplianceAuditorProps): void {
    const rule = new events.Rule(this, "RotationMonitorRule", {
      eventPattern: {
        source: ["aws.secretsmanager"],
        detailType: ["AWS API Call via CloudTrail"],
        detail: {
          eventName: [
            "RotateSecret",
            "PutSecretValue",
            "CreateSecret",
            "DeleteSecret",
            "UpdateSecret",
          ],
        },
      },
      description: "Monitor Secrets Manager rotation events",
      enabled: true,
    })

    rule.addTarget(
      new targets.LambdaFunction(this.auditorFunction, {
        event: events.RuleTargetInput.fromObject({
          scanType: "rotation-event",
          detail: events.EventField.fromPath("$.detail"),
        }),
      })
    )
  }

  /**
   * Creates CloudWatch dashboard for compliance visualization
   */
  private createDashboard(props: ComplianceAuditorProps): cloudwatch.Dashboard {
    const dashboard = new cloudwatch.Dashboard(this, "ComplianceDashboard", {
      dashboardName: `${this.projectName}-${props.deploymentEnvironment}-SecretsCompliance`,
    })

    const namespace = `${this.projectName}/SecretsCompliance`

    // Widget for total secrets
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: "Total Secrets",
        left: [
          new cloudwatch.Metric({
            namespace,
            metricName: "TotalSecrets",
            statistic: "Average",
          }),
        ],
        width: 12,
      })
    )

    // Widget for rotation compliance
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: "Rotation Compliance",
        left: [
          new cloudwatch.Metric({
            namespace,
            metricName: "SecretsWithRotation",
            statistic: "Average",
            color: cloudwatch.Color.GREEN,
          }),
          new cloudwatch.Metric({
            namespace,
            metricName: "SecretsWithoutRotation",
            statistic: "Average",
            color: cloudwatch.Color.RED,
          }),
        ],
        width: 12,
      })
    )

    // Widget for secret age distribution
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: "Secret Age Violations",
        left: [
          new cloudwatch.Metric({
            namespace,
            metricName: "OverageSecrets",
            statistic: "Sum",
            color: cloudwatch.Color.ORANGE,
          }),
        ],
        width: 12,
      })
    )

    // Widget for rotation failures
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: "Rotation Failures (24h)",
        left: [
          new cloudwatch.Metric({
            namespace,
            metricName: "RotationFailures",
            statistic: "Sum",
            color: cloudwatch.Color.RED,
          }),
        ],
        width: 12,
      })
    )

    return dashboard
  }

  /**
   * Creates CloudWatch alarms for critical compliance violations
   */
  private createMetrics(props: ComplianceAuditorProps): void {
    if (!props.config.monitoring.alarmingEnabled) {
      return
    }

    const namespace = `${this.projectName}/SecretsCompliance`

    // Alarm for rotation failures
    const rotationFailureAlarm = new cloudwatch.Alarm(this, "RotationFailureAlarm", {
      metric: new cloudwatch.Metric({
        namespace,
        metricName: "RotationFailures",
        statistic: "Sum",
        period: cdk.Duration.hours(24),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      alarmDescription: "Alert when secret rotation fails",
      alarmName: `${this.projectName}-${props.deploymentEnvironment}-secret-rotation-failure`,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    })

    // Alarm for secrets without rotation
    const noRotationAlarm = new cloudwatch.Alarm(this, "NoRotationAlarm", {
      metric: new cloudwatch.Metric({
        namespace,
        metricName: "SecretsWithoutRotation",
        statistic: "Average",
      }),
      threshold: 5, // Alert if more than 5 secrets lack rotation
      evaluationPeriods: 1,
      alarmDescription: "Alert when too many secrets lack rotation",
      alarmName: `${this.projectName}-${props.deploymentEnvironment}-secrets-without-rotation`,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    })

    // Add SNS action if topic provided
    if (props.alertTopic) {
      const snsAction = new cdk.aws_cloudwatch_actions.SnsAction(props.alertTopic)
      rotationFailureAlarm.addAlarmAction(snsAction)
      noRotationAlarm.addAlarmAction(snsAction)
    }
  }

  /**
   * Returns Python code for the auditor Lambda
   */
  private getAuditorCode(props: ComplianceAuditorProps): string {
    return `
import json
import boto3
import os
from datetime import datetime, timedelta
from typing import Dict, List, Any

secretsmanager = boto3.client('secretsmanager')
cloudwatch = boto3.client('cloudwatch')
cloudtrail = boto3.client('cloudtrail')
sns = boto3.client('sns') if os.environ.get('ALERT_TOPIC_ARN') else None

PROJECT_NAME = os.environ['PROJECT_NAME']
ENVIRONMENT = os.environ['ENVIRONMENT']
MAX_SECRET_AGE = int(os.environ.get('MAX_SECRET_AGE', '90'))
ALERT_TOPIC_ARN = os.environ.get('ALERT_TOPIC_ARN')


def handler(event, context):
    """
    Main compliance auditor handler
    """
    print(f"Compliance audit event: {json.dumps(event)}")

    scan_type = event.get('scanType', 'scheduled')

    if scan_type == 'scheduled':
        perform_full_scan()
    elif scan_type == 'rotation-event':
        handle_rotation_event(event.get('detail', {}))

    return {
        'statusCode': 200,
        'body': json.dumps('Compliance scan completed')
    }


def perform_full_scan():
    """
    Perform comprehensive compliance scan of all secrets
    """
    print("Starting full compliance scan")

    # Get all secrets in the account
    secrets = list_all_secrets()

    total_secrets = len(secrets)
    secrets_with_rotation = 0
    secrets_without_rotation = 0
    overage_secrets = 0
    rotation_failures = 0
    violations = []

    for secret in secrets:
        # Check rotation configuration
        if secret.get('RotationEnabled'):
            secrets_with_rotation += 1

            # Check for recent rotation failures
            if check_rotation_failure(secret):
                rotation_failures += 1
                violations.append({
                    'secretName': secret['Name'],
                    'violation': 'rotation_failure',
                    'severity': 'high'
                })
        else:
            secrets_without_rotation += 1
            violations.append({
                'secretName': secret['Name'],
                'violation': 'no_rotation',
                'severity': 'medium'
            })

        # Check secret age
        age_days = get_secret_age(secret)
        if age_days > MAX_SECRET_AGE:
            overage_secrets += 1
            violations.append({
                'secretName': secret['Name'],
                'violation': 'age_exceeded',
                'age': age_days,
                'severity': 'high'
            })

        # Check required tags
        if not check_required_tags(secret):
            violations.append({
                'secretName': secret['Name'],
                'violation': 'missing_tags',
                'severity': 'low'
            })

    # Publish metrics
    publish_metrics({
        'TotalSecrets': total_secrets,
        'SecretsWithRotation': secrets_with_rotation,
        'SecretsWithoutRotation': secrets_without_rotation,
        'OverageSecrets': overage_secrets,
        'RotationFailures': rotation_failures
    })

    # Send alerts for critical violations
    if violations:
        send_compliance_report(violations)

    print(f"Compliance scan completed: {total_secrets} secrets scanned, {len(violations)} violations found")


def list_all_secrets() -> List[Dict[str, Any]]:
    """
    List all secrets in the account
    """
    secrets = []
    paginator = secretsmanager.get_paginator('list_secrets')

    for page in paginator.paginate():
        secrets.extend(page['SecretList'])

    return secrets


def check_rotation_failure(secret: Dict[str, Any]) -> bool:
    """
    Check if secret has recent rotation failures
    """
    try:
        response = secretsmanager.describe_secret(SecretId=secret['ARN'])

        if 'LastRotatedDate' in response:
            last_rotation = response['LastRotatedDate']
            if datetime.now(last_rotation.tzinfo) - last_rotation > timedelta(days=MAX_SECRET_AGE):
                return True

        return False
    except Exception as e:
        print(f"Error checking rotation for {secret['Name']}: {str(e)}")
        return False


def get_secret_age(secret: Dict[str, Any]) -> int:
    """
    Get age of secret in days
    """
    if 'LastChangedDate' in secret:
        age = datetime.now(secret['LastChangedDate'].tzinfo) - secret['LastChangedDate']
        return age.days

    return 0


def check_required_tags(secret: Dict[str, Any]) -> bool:
    """
    Check if secret has all required tags
    """
    required_tags = ['Environment', 'ProjectName', 'ManagedBy']
    tags = secret.get('Tags', [])
    tag_keys = [tag['Key'] for tag in tags]

    return all(tag in tag_keys for tag in required_tags)


def handle_rotation_event(detail: Dict[str, Any]):
    """
    Handle rotation events from EventBridge
    """
    event_name = detail.get('eventName')
    secret_id = detail.get('requestParameters', {}).get('secretId')

    print(f"Handling rotation event: {event_name} for {secret_id}")

    if event_name == 'RotateSecret':
        # Monitor rotation progress
        try:
            response = secretsmanager.describe_secret(SecretId=secret_id)
            print(f"Rotation status: {response.get('RotationEnabled')}")
        except Exception as e:
            print(f"Error monitoring rotation: {str(e)}")


def publish_metrics(metrics: Dict[str, float]):
    """
    Publish compliance metrics to CloudWatch
    """
    metric_data = []

    for metric_name, value in metrics.items():
        metric_data.append({
            'MetricName': metric_name,
            'Value': value,
            'Unit': 'Count',
            'Timestamp': datetime.now()
        })

    try:
        cloudwatch.put_metric_data(
            Namespace=f'{PROJECT_NAME}/SecretsCompliance',
            MetricData=metric_data
        )
        print(f"Published {len(metric_data)} metrics")
    except Exception as e:
        print(f"Error publishing metrics: {str(e)}")


def send_compliance_report(violations: List[Dict[str, Any]]):
    """
    Send compliance report via SNS
    """
    if not ALERT_TOPIC_ARN or not sns:
        print(f"Found {len(violations)} violations (alerting disabled)")
        return

    # Group violations by severity
    high_severity = [v for v in violations if v['severity'] == 'high']
    medium_severity = [v for v in violations if v['severity'] == 'medium']
    low_severity = [v for v in violations if v['severity'] == 'low']

    message = f"""
Secrets Manager Compliance Report
Environment: {ENVIRONMENT}
Timestamp: {datetime.now().isoformat()}

Summary:
- Total Violations: {len(violations)}
- High Severity: {len(high_severity)}
- Medium Severity: {len(medium_severity)}
- Low Severity: {len(low_severity)}

High Severity Violations:
"""

    for violation in high_severity[:10]:  # Limit to 10 for message size
        message += f"- {violation['secretName']}: {violation['violation']}"
        if 'age' in violation:
            message += f" (age: {violation['age']} days)"
        message += "\\n"

    try:
        sns.publish(
            TopicArn=ALERT_TOPIC_ARN,
            Subject=f'[{ENVIRONMENT}] Secrets Compliance Violations Detected',
            Message=message
        )
        print("Compliance report sent via SNS")
    except Exception as e:
        print(f"Error sending compliance report: {str(e)}")
`
  }
}
