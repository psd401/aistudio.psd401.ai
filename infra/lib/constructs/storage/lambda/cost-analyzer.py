"""
S3 Cost Analyzer Lambda Function

Analyzes S3 storage costs and generates optimization recommendations
"""

import json
import boto3
from datetime import datetime, timedelta
from typing import Dict, List, Any
from decimal import Decimal

s3 = boto3.client('s3')
ce = boto3.client('ce')
cloudwatch = boto3.client('cloudwatch')
sns = boto3.client('sns')


class DecimalEncoder(json.JSONEncoder):
    """JSON encoder for Decimal objects"""
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super(DecimalEncoder, self).default(obj)


def handler(event, context):
    """
    Main handler for cost analysis Lambda

    Analyzes S3 costs and generates recommendations for optimization
    """
    try:
        # Get S3 costs for the last 30 days
        end_date = datetime.now().date()
        start_date = end_date - timedelta(days=30)

        # Get cost and usage data
        cost_data = get_s3_costs(start_date, end_date)

        # Analyze storage classes and identify optimization opportunities
        analysis = analyze_storage_classes(cost_data)

        # Generate recommendations
        recommendations = generate_recommendations(analysis)

        # Calculate potential savings
        savings = calculate_savings(analysis)

        # Publish metrics to CloudWatch
        publish_metrics(analysis, savings)

        # Send alert if significant savings are possible
        if savings['potential_monthly_savings'] > 100:
            send_alert(recommendations, savings)

        return {
            'statusCode': 200,
            'body': json.dumps({
                'analysis': analysis,
                'recommendations': recommendations,
                'savings': savings
            }, cls=DecimalEncoder)
        }

    except Exception as e:
        print(f"Error in cost analyzer: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }


def get_s3_costs(start_date, end_date) -> Dict[str, Any]:
    """Get S3 costs from Cost Explorer"""
    response = ce.get_cost_and_usage(
        TimePeriod={
            'Start': start_date.isoformat(),
            'End': end_date.isoformat()
        },
        Granularity='MONTHLY',
        Metrics=['UnblendedCost', 'UsageQuantity'],
        GroupBy=[
            {'Type': 'DIMENSION', 'Key': 'SERVICE'},
            {'Type': 'DIMENSION', 'Key': 'USAGE_TYPE'}
        ],
        Filter={
            'Dimensions': {
                'Key': 'SERVICE',
                'Values': ['Amazon Simple Storage Service']
            }
        }
    )

    return response


def analyze_storage_classes(cost_data: Dict[str, Any]) -> Dict[str, Any]:
    """Analyze storage class distribution and costs"""
    analysis = {
        'total_cost': Decimal('0'),
        'storage_classes': {},
        'optimization_opportunities': []
    }

    for result in cost_data.get('ResultsByTime', []):
        for group in result.get('Groups', []):
            usage_type = group['Keys'][1]
            amount = Decimal(group['Metrics']['UnblendedCost']['Amount'])
            quantity = Decimal(group['Metrics']['UsageQuantity']['Amount'])

            # Parse storage class from usage type
            storage_class = parse_storage_class(usage_type)

            if storage_class not in analysis['storage_classes']:
                analysis['storage_classes'][storage_class] = {
                    'cost': Decimal('0'),
                    'quantity': Decimal('0')
                }

            analysis['storage_classes'][storage_class]['cost'] += amount
            analysis['storage_classes'][storage_class]['quantity'] += quantity
            analysis['total_cost'] += amount

    return analysis


def parse_storage_class(usage_type: str) -> str:
    """Parse storage class from usage type string"""
    if 'TimedStorage-ByteHrs' in usage_type:
        if 'StandardStorage' in usage_type:
            return 'Standard'
        elif 'StandardIAStorage' in usage_type:
            return 'Standard-IA'
        elif 'IntelligentTiering' in usage_type:
            return 'Intelligent-Tiering'
        elif 'GlacierInstantRetrieval' in usage_type:
            return 'Glacier Instant Retrieval'
        elif 'GlacierStorage' in usage_type:
            return 'Glacier Flexible Retrieval'
        elif 'DeepArchiveStorage' in usage_type:
            return 'Glacier Deep Archive'

    return 'Other'


def generate_recommendations(analysis: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Generate cost optimization recommendations"""
    recommendations = []

    storage_classes = analysis.get('storage_classes', {})

    # Check if too much data is in Standard storage
    if 'Standard' in storage_classes:
        standard_cost = storage_classes['Standard']['cost']
        total_cost = analysis['total_cost']

        if total_cost > 0 and (standard_cost / total_cost) > Decimal('0.7'):
            recommendations.append({
                'priority': 'HIGH',
                'title': 'Excessive Standard Storage Usage',
                'description': 'More than 70% of storage costs are from Standard tier',
                'action': 'Enable Intelligent-Tiering or implement lifecycle policies to transition older objects to lower-cost tiers',
                'estimated_savings': float(standard_cost * Decimal('0.4'))
            })

    # Recommend Intelligent-Tiering if not used
    if 'Intelligent-Tiering' not in storage_classes or storage_classes['Intelligent-Tiering']['cost'] < Decimal('10'):
        recommendations.append({
            'priority': 'MEDIUM',
            'title': 'Enable Intelligent-Tiering',
            'description': 'Intelligent-Tiering is not being utilized',
            'action': 'Configure buckets to use Intelligent-Tiering for objects with unknown access patterns',
            'estimated_savings': 'Variable, typically 20-40% cost reduction'
        })

    # Recommend lifecycle policies
    recommendations.append({
        'priority': 'MEDIUM',
        'title': 'Implement Lifecycle Policies',
        'description': 'Automate transitions between storage classes',
        'action': 'Configure lifecycle rules to automatically move old objects to cheaper storage tiers',
        'estimated_savings': 'Up to 60% on infrequently accessed data'
    })

    return recommendations


def calculate_savings(analysis: Dict[str, Any]) -> Dict[str, float]:
    """Calculate potential monthly savings"""
    storage_classes = analysis.get('storage_classes', {})

    # Estimate savings by moving Standard to Intelligent-Tiering
    standard_cost = storage_classes.get('Standard', {}).get('cost', Decimal('0'))
    potential_savings = float(standard_cost * Decimal('0.3'))  # Conservative 30% estimate

    return {
        'current_monthly_cost': float(analysis['total_cost']),
        'potential_monthly_savings': potential_savings,
        'estimated_annual_savings': potential_savings * 12,
        'savings_percentage': float((potential_savings / analysis['total_cost'] * 100)) if analysis['total_cost'] > 0 else 0
    }


def publish_metrics(analysis: Dict[str, Any], savings: Dict[str, float]):
    """Publish metrics to CloudWatch"""
    metrics = []

    # Total cost metric
    metrics.append({
        'MetricName': 'S3TotalCost',
        'Value': savings['current_monthly_cost'],
        'Unit': 'None',
        'Timestamp': datetime.now()
    })

    # Potential savings metric
    metrics.append({
        'MetricName': 'S3PotentialSavings',
        'Value': savings['potential_monthly_savings'],
        'Unit': 'None',
        'Timestamp': datetime.now()
    })

    # Storage class distribution
    for storage_class, data in analysis.get('storage_classes', {}).items():
        metrics.append({
            'MetricName': f'S3Cost{storage_class.replace(" ", "")}',
            'Value': float(data['cost']),
            'Unit': 'None',
            'Timestamp': datetime.now()
        })

    # Publish to CloudWatch
    cloudwatch.put_metric_data(
        Namespace='AIStudio/S3Optimization',
        MetricData=metrics
    )


def send_alert(recommendations: List[Dict[str, Any]], savings: Dict[str, float]):
    """Send SNS alert about optimization opportunities"""
    topic_arn = get_sns_topic_arn()

    if not topic_arn:
        print("No SNS topic configured, skipping alert")
        return

    message = format_alert_message(recommendations, savings)

    sns.publish(
        TopicArn=topic_arn,
        Subject='S3 Cost Optimization Opportunities Detected',
        Message=message
    )


def get_sns_topic_arn() -> str:
    """Get SNS topic ARN from environment"""
    import os
    return os.environ.get('SNS_TOPIC_ARN', '')


def format_alert_message(recommendations: List[Dict[str, Any]], savings: Dict[str, float]) -> str:
    """Format alert message"""
    message = f"""S3 Cost Optimization Alert

Current Monthly Cost: ${savings['current_monthly_cost']:.2f}
Potential Monthly Savings: ${savings['potential_monthly_savings']:.2f}
Estimated Annual Savings: ${savings['estimated_annual_savings']:.2f}
Savings Percentage: {savings['savings_percentage']:.1f}%

Recommendations:
"""

    for i, rec in enumerate(recommendations, 1):
        message += f"\n{i}. [{rec['priority']}] {rec['title']}\n"
        message += f"   {rec['description']}\n"
        message += f"   Action: {rec['action']}\n"
        if isinstance(rec.get('estimated_savings'), (int, float)):
            message += f"   Estimated Savings: ${rec['estimated_savings']:.2f}\n"
        else:
            message += f"   Estimated Savings: {rec.get('estimated_savings', 'N/A')}\n"

    return message
