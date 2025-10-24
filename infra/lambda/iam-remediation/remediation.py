"""
IAM Access Analyzer Findings Remediation Lambda

This Lambda function processes Access Analyzer findings and performs
automated remediation for security violations in development environments.
"""

import json
import os
import boto3
from typing import Dict, Any, List
from datetime import datetime

# Initialize AWS clients
access_analyzer = boto3.client('access-analyzer')
iam_client = boto3.client('iam')
s3_client = boto3.client('s3')
sns_client = boto3.client('sns')
cloudwatch = boto3.client('cloudwatch')

# Configuration from environment
ANALYZER_ARN = os.environ['ANALYZER_ARN']
SNS_TOPIC_ARN = os.environ['SNS_TOPIC_ARN']
AUTO_REMEDIATE = os.environ.get('AUTO_REMEDIATE', 'false').lower() == 'true'
ENVIRONMENT = os.environ.get('ENVIRONMENT', 'dev')


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Main Lambda handler for processing Access Analyzer findings
    """
    print(f"Received event: {json.dumps(event)}")

    try:
        # Extract finding from event
        detail = event.get('detail', {})
        finding_id = detail.get('id')
        resource_type = detail.get('resourceType')
        finding_type = detail.get('findingType')

        if not finding_id:
            raise ValueError("No finding ID in event")

        # Get full finding details
        finding = get_finding_details(finding_id)

        # Analyze finding severity
        severity = analyze_severity(finding)

        # Log metric
        log_metric('AccessAnalyzerFindings', 1, severity)

        # Determine if remediation should occur
        should_remediate = AUTO_REMEDIATE and severity in ['CRITICAL', 'HIGH']

        result = {
            'finding_id': finding_id,
            'resource_type': resource_type,
            'finding_type': finding_type,
            'severity': severity,
            'remediated': False
        }

        if should_remediate:
            # Attempt remediation
            remediation_result = remediate_finding(finding)
            result['remediated'] = remediation_result['success']
            result['remediation_action'] = remediation_result.get('action')

            if remediation_result['success']:
                log_metric('AutomaticRemediations', 1, severity)
            else:
                log_metric('RemediationFailures', 1, severity)

        # Send alert notification
        send_alert(finding, result)

        return {
            'statusCode': 200,
            'body': json.dumps(result)
        }

    except Exception as e:
        print(f"Error processing finding: {str(e)}")
        send_error_alert(event, str(e))
        raise


def get_finding_details(finding_id: str) -> Dict[str, Any]:
    """
    Get full details for a finding from Access Analyzer
    """
    response = access_analyzer.list_findings(
        analyzerArn=ANALYZER_ARN,
        filter={
            'id': {
                'eq': [finding_id]
            }
        }
    )

    findings = response.get('findings', [])
    if not findings:
        raise ValueError(f"Finding {finding_id} not found")

    return findings[0]


def analyze_severity(finding: Dict[str, Any]) -> str:
    """
    Analyze finding and assign severity level
    """
    resource_type = finding.get('resourceType')
    finding_type = finding.get('findingType')
    is_public = finding.get('isPublic', False)

    # Critical: Public IAM roles or admin policies
    if resource_type == 'AWS::IAM::Role' and is_public:
        return 'CRITICAL'

    if 'AdministratorAccess' in str(finding):
        return 'CRITICAL'

    # High: Public S3 buckets or overly permissive policies
    if resource_type == 'AWS::S3::Bucket' and is_public:
        return 'HIGH'

    if finding_type == 'OverlyPermissive':
        return 'HIGH'

    # Medium: External access with conditions
    if finding_type == 'ExternalAccess':
        return 'MEDIUM'

    # Low: Everything else
    return 'LOW'


def remediate_finding(finding: Dict[str, Any]) -> Dict[str, Any]:
    """
    Attempt to remediate a finding
    """
    resource_type = finding.get('resourceType')
    resource_arn = finding.get('resource')

    try:
        if resource_type == 'AWS::IAM::Role':
            return remediate_iam_role(finding)
        elif resource_type == 'AWS::S3::Bucket':
            return remediate_s3_bucket(finding)
        else:
            return {
                'success': False,
                'reason': f'No remediation available for {resource_type}'
            }
    except Exception as e:
        return {
            'success': False,
            'reason': str(e)
        }


def remediate_iam_role(finding: Dict[str, Any]) -> Dict[str, Any]:
    """
    Remediate overly permissive IAM role

    IMPORTANT: This function includes explicit tag checking as a fallback because
    some IAM actions (like DeleteRolePolicy) do NOT support resource tag conditions
    in IAM policies. This code-level validation ensures we only modify dev resources
    even if the IAM policy condition fails to restrict access.
    """
    resource_arn = finding.get('resource')
    role_name = resource_arn.split('/')[-1]

    # Get role details
    response = iam_client.get_role(RoleName=role_name)
    role = response['Role']

    # EXPLICIT TAG CHECK - Fallback for IAM actions that don't support tag conditions
    # This prevents accidental modification of production resources
    tags = {tag['Key']: tag['Value'] for tag in role.get('Tags', [])}

    if tags.get('ManagedBy') != 'BaseIAMRole':
        return {
            'success': False,
            'reason': 'Role not managed by BaseIAMRole construct'
        }

    if tags.get('Environment') != ENVIRONMENT:
        return {
            'success': False,
            'reason': f'Role environment {tags.get("Environment")} does not match {ENVIRONMENT}'
        }

    # List inline policies
    policies_response = iam_client.list_role_policies(RoleName=role_name)
    inline_policies = policies_response.get('PolicyNames', [])

    remediation_actions = []

    # Check each inline policy for violations
    for policy_name in inline_policies:
        policy_response = iam_client.get_role_policy(
            RoleName=role_name,
            PolicyName=policy_name
        )
        policy_document = policy_response['PolicyDocument']

        # Check for wildcard resources
        has_wildcards = check_for_wildcards(policy_document)

        if has_wildcards:
            # In dev, we can delete overly permissive policies
            # In production, we only alert
            if ENVIRONMENT == 'dev':
                iam_client.delete_role_policy(
                    RoleName=role_name,
                    PolicyName=policy_name
                )
                remediation_actions.append(f'Deleted policy {policy_name}')

    if remediation_actions:
        return {
            'success': True,
            'action': '; '.join(remediation_actions)
        }

    return {
        'success': False,
        'reason': 'No remediable violations found'
    }


def remediate_s3_bucket(finding: Dict[str, Any]) -> Dict[str, Any]:
    """
    Remediate overly permissive S3 bucket
    """
    resource_arn = finding.get('resource')
    bucket_name = resource_arn.split(':::')[-1]

    # Only proceed in dev environment
    if ENVIRONMENT != 'dev':
        return {
            'success': False,
            'reason': 'S3 remediation only allowed in dev environment'
        }

    # Check bucket tags
    try:
        tags_response = s3_client.get_bucket_tagging(Bucket=bucket_name)
        tags = {tag['Key']: tag['Value'] for tag in tags_response.get('TagSet', [])}

        if tags.get('Environment') != 'dev':
            return {
                'success': False,
                'reason': 'Bucket is not tagged as dev environment'
            }
    except s3_client.exceptions.NoSuchTagSet:
        # No tags set, skip remediation
        return {
            'success': False,
            'reason': 'Bucket has no environment tags'
        }

    # For dev buckets with public access, we can add block public access
    s3_client.put_public_access_block(
        Bucket=bucket_name,
        PublicAccessBlockConfiguration={
            'BlockPublicAcls': True,
            'IgnorePublicAcls': True,
            'BlockPublicPolicy': True,
            'RestrictPublicBuckets': True
        }
    )

    return {
        'success': True,
        'action': 'Applied Block Public Access configuration'
    }


def check_for_wildcards(policy_document: Dict[str, Any]) -> bool:
    """
    Check if policy document contains wildcard resources
    """
    statements = policy_document.get('Statement', [])

    for statement in statements:
        resources = statement.get('Resource', [])
        if isinstance(resources, str):
            resources = [resources]

        for resource in resources:
            if resource == '*' or resource.endswith(':*/*'):
                # Check if it's an allowed wildcard
                actions = statement.get('Action', [])
                if isinstance(actions, str):
                    actions = [actions]

                # X-Ray and CloudWatch Logs are allowed wildcards
                allowed = all(
                    action.startswith('xray:') or
                    action.startswith('logs:') or
                    action.startswith('cloudwatch:')
                    for action in actions
                )

                if not allowed:
                    return True

    return False


def send_alert(finding: Dict[str, Any], result: Dict[str, Any]) -> None:
    """
    Send SNS alert for finding
    """
    severity = result.get('severity', 'UNKNOWN')
    remediated = result.get('remediated', False)

    subject = f"[{severity}] Access Analyzer Finding - {finding.get('resourceType')}"

    message = f"""
Access Analyzer Finding Detected

Environment: {ENVIRONMENT}
Severity: {severity}
Finding ID: {finding.get('id')}
Resource Type: {finding.get('resourceType')}
Resource: {finding.get('resource')}
Finding Type: {finding.get('findingType')}
Is Public: {finding.get('isPublic', False)}

Remediation Status: {'✓ REMEDIATED' if remediated else '✗ NOT REMEDIATED'}
{f"Remediation Action: {result.get('remediation_action')}" if remediated else ''}

Time: {datetime.utcnow().isoformat()}

Please review this finding in the AWS Console:
https://console.aws.amazon.com/access-analyzer/home
"""

    sns_client.publish(
        TopicArn=SNS_TOPIC_ARN,
        Subject=subject,
        Message=message
    )


def send_error_alert(event: Dict[str, Any], error: str) -> None:
    """
    Send SNS alert for processing errors
    """
    sns_client.publish(
        TopicArn=SNS_TOPIC_ARN,
        Subject=f"[ERROR] Access Analyzer Remediation Failed - {ENVIRONMENT}",
        Message=f"""
Error processing Access Analyzer finding

Environment: {ENVIRONMENT}
Error: {error}
Event: {json.dumps(event, indent=2)}
Time: {datetime.utcnow().isoformat()}
"""
    )


def log_metric(metric_name: str, value: float, severity: str = None) -> None:
    """
    Log custom CloudWatch metric
    """
    dimensions = [
        {
            'Name': 'Environment',
            'Value': ENVIRONMENT
        }
    ]

    if severity:
        dimensions.append({
            'Name': 'Severity',
            'Value': severity
        })

    cloudwatch.put_metric_data(
        Namespace='AIStudio/Security',
        MetricData=[
            {
                'MetricName': metric_name,
                'Value': value,
                'Unit': 'Count',
                'Timestamp': datetime.utcnow(),
                'Dimensions': dimensions
            }
        ]
    )
