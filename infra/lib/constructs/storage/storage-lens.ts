import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import { Construct } from 'constructs';

export interface StorageLensProps {
  /** Environment (dev, prod) */
  environment: string;
  /** Bucket for Storage Lens reports */
  reportBucket: s3.IBucket;
  /** Regions to monitor */
  regions?: string[];
  /** Buckets to include (default: all) */
  buckets?: string[];
}

/**
 * AWS S3 Storage Lens configuration for comprehensive storage analytics
 */
export class StorageLensConfig extends Construct {
  public readonly dashboard: cloudwatch.Dashboard;

  constructor(scope: Construct, id: string, props: StorageLensProps) {
    super(scope, id);

    // Create Storage Lens configuration
    new s3.CfnStorageLens(this, 'StorageLens', {
      storageLensConfiguration: {
        id: `aistudio-lens-${props.environment}`,
        accountLevel: {
          activityMetrics: {
            isEnabled: true,
          },
          bucketLevel: {
            activityMetrics: {
              isEnabled: true,
            },
            prefixLevel: {
              storageMetrics: {
                isEnabled: true,
                selectionCriteria: {
                  delimiter: '/',
                  maxDepth: 3,
                  minStorageBytesPercentage: 1,
                },
              },
            },
          },
        },
        include: {
          buckets: props.buckets ?? [],
          regions: props.regions ?? [cdk.Aws.REGION],
        },
        dataExport: {
          s3BucketDestination: {
            accountId: cdk.Aws.ACCOUNT_ID,
            arn: props.reportBucket.bucketArn,
            prefix: `storage-lens/${props.environment}/`,
            format: 'Parquet',
            outputSchemaVersion: 'V_1',
            encryption: {
              sses3: {},
            },
          },
        },
        isEnabled: true,
      },
    });

    // Create CloudWatch Dashboard for Storage analytics
    this.dashboard = new cloudwatch.Dashboard(this, 'StorageDashboard', {
      dashboardName: `S3-Storage-${props.environment}`,
      defaultInterval: cdk.Duration.days(7),
    });

    // Add widgets to dashboard
    this.dashboard.addWidgets(
      new cloudwatch.TextWidget({
        markdown: `# S3 Storage Analytics - ${props.environment}\n\nComprehensive storage metrics and cost optimization insights`,
        width: 24,
        height: 2,
      })
    );

    this.dashboard.addWidgets(
      this.createStorageByClassWidget(),
      this.createObjectCountWidget(),
      this.createRequestMetricsWidget()
    );

    this.dashboard.addWidgets(
      this.createStorageTrendWidget(),
      this.createCostOptimizationWidget(),
      this.createDataTransferWidget()
    );
  }

  /**
   * Create widget for storage by class
   */
  private createStorageByClassWidget(): cloudwatch.GraphWidget {
    return new cloudwatch.GraphWidget({
      title: 'Storage by Class',
      width: 8,
      height: 6,
      left: [
        new cloudwatch.Metric({
          namespace: 'AWS/S3',
          metricName: 'BucketSizeBytes',
          dimensionsMap: {
            StorageType: 'StandardStorage',
          },
          statistic: 'Average',
          label: 'Standard',
          period: cdk.Duration.days(1),
        }),
        new cloudwatch.Metric({
          namespace: 'AWS/S3',
          metricName: 'BucketSizeBytes',
          dimensionsMap: {
            StorageType: 'IntelligentTieringFAStorage',
          },
          statistic: 'Average',
          label: 'Intelligent-Tiering (Frequent Access)',
          period: cdk.Duration.days(1),
        }),
        new cloudwatch.Metric({
          namespace: 'AWS/S3',
          metricName: 'BucketSizeBytes',
          dimensionsMap: {
            StorageType: 'IntelligentTieringIAStorage',
          },
          statistic: 'Average',
          label: 'Intelligent-Tiering (Infrequent Access)',
          period: cdk.Duration.days(1),
        }),
        new cloudwatch.Metric({
          namespace: 'AWS/S3',
          metricName: 'BucketSizeBytes',
          dimensionsMap: {
            StorageType: 'GlacierInstantRetrievalStorage',
          },
          statistic: 'Average',
          label: 'Glacier Instant Retrieval',
          period: cdk.Duration.days(1),
        }),
      ],
      stacked: true,
      leftYAxis: {
        label: 'Bytes',
        showUnits: true,
      },
    });
  }

  /**
   * Create widget for object count
   */
  private createObjectCountWidget(): cloudwatch.GraphWidget {
    return new cloudwatch.GraphWidget({
      title: 'Object Count',
      width: 8,
      height: 6,
      left: [
        new cloudwatch.Metric({
          namespace: 'AWS/S3',
          metricName: 'NumberOfObjects',
          dimensionsMap: {
            StorageType: 'AllStorageTypes',
          },
          statistic: 'Average',
          label: 'Total Objects',
          period: cdk.Duration.days(1),
        }),
      ],
      leftYAxis: {
        label: 'Count',
        showUnits: true,
      },
    });
  }

  /**
   * Create widget for request metrics
   */
  private createRequestMetricsWidget(): cloudwatch.GraphWidget {
    return new cloudwatch.GraphWidget({
      title: 'Request Metrics (Daily)',
      width: 8,
      height: 6,
      left: [
        new cloudwatch.Metric({
          namespace: 'AWS/S3',
          metricName: 'AllRequests',
          statistic: 'Sum',
          label: 'All Requests',
          period: cdk.Duration.days(1),
          color: cloudwatch.Color.BLUE,
        }),
        new cloudwatch.Metric({
          namespace: 'AWS/S3',
          metricName: 'GetRequests',
          statistic: 'Sum',
          label: 'GET Requests',
          period: cdk.Duration.days(1),
          color: cloudwatch.Color.GREEN,
        }),
        new cloudwatch.Metric({
          namespace: 'AWS/S3',
          metricName: 'PutRequests',
          statistic: 'Sum',
          label: 'PUT Requests',
          period: cdk.Duration.days(1),
          color: cloudwatch.Color.ORANGE,
        }),
      ],
      leftYAxis: {
        label: 'Requests',
        showUnits: true,
      },
    });
  }

  /**
   * Create widget for storage trend
   */
  private createStorageTrendWidget(): cloudwatch.GraphWidget {
    return new cloudwatch.GraphWidget({
      title: 'Storage Trend (30 Days)',
      width: 12,
      height: 6,
      left: [
        new cloudwatch.Metric({
          namespace: 'AWS/S3',
          metricName: 'BucketSizeBytes',
          dimensionsMap: {
            StorageType: 'StandardStorage',
          },
          statistic: 'Average',
          label: 'Total Storage',
          period: cdk.Duration.days(1),
        }),
      ],
      leftYAxis: {
        label: 'Bytes',
        showUnits: true,
      },
    });
  }

  /**
   * Create widget for cost optimization insights
   */
  private createCostOptimizationWidget(): cloudwatch.TextWidget {
    return new cloudwatch.TextWidget({
      markdown: `## Cost Optimization Insights

### Actions to Reduce Costs:
- **Lifecycle Policies**: Ensure all buckets have appropriate lifecycle rules
- **Intelligent-Tiering**: Enable for objects with unknown access patterns
- **CloudFront**: Use CDN to reduce data transfer costs
- **S3 Select**: Use for partial object retrieval to reduce data transfer

### Monitoring:
- Check Storage Lens reports in S3 for detailed analytics
- Review prefix-level metrics for granular insights
- Monitor object age distribution for lifecycle optimization`,
      width: 12,
      height: 6,
    });
  }

  /**
   * Create widget for data transfer metrics
   */
  private createDataTransferWidget(): cloudwatch.GraphWidget {
    return new cloudwatch.GraphWidget({
      title: 'Data Transfer (Daily)',
      width: 12,
      height: 6,
      left: [
        new cloudwatch.Metric({
          namespace: 'AWS/S3',
          metricName: 'BytesDownloaded',
          statistic: 'Sum',
          label: 'Bytes Downloaded',
          period: cdk.Duration.days(1),
          color: cloudwatch.Color.PURPLE,
        }),
        new cloudwatch.Metric({
          namespace: 'AWS/S3',
          metricName: 'BytesUploaded',
          statistic: 'Sum',
          label: 'Bytes Uploaded',
          period: cdk.Duration.days(1),
          color: cloudwatch.Color.PINK,
        }),
      ],
      leftYAxis: {
        label: 'Bytes',
        showUnits: true,
      },
    });
  }
}
