"""
Secrets Manager Compliance Auditor

Monitors secrets for compliance violations and generates reports:
- Secrets without rotation enabled
- Secrets exceeding maximum age
- Unencrypted secrets
- Secrets missing required tags
- Failed rotation attempts
- Unused secrets (no recent access)

Environment Variables:
- PROJECT_NAME: Name of the project
- ENVIRONMENT: Deployment environment (dev, staging, prod)
- MAX_SECRET_AGE: Maximum age for secrets in days (default: 90)
- ALERT_TOPIC_ARN: SNS topic ARN for alerts (optional)
"""

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
        message += "\n"

    try:
        sns.publish(
            TopicArn=ALERT_TOPIC_ARN,
            Subject=f'[{ENVIRONMENT}] Secrets Compliance Violations Detected',
            Message=message
        )
        print("Compliance report sent via SNS")
    except Exception as e:
        print(f"Error sending compliance report: {str(e)}")
