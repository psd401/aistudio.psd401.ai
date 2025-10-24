import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { DataClassification, DataClassifier, DataClassificationRule } from './data-classification';

export interface OptimizedBucketProps {
  /** Bucket name */
  bucketName?: string;
  /** Primary data classification for the bucket */
  dataClassification: DataClassification;
  /** Custom classification rules for different prefixes */
  classificationRules?: DataClassificationRule[];
  /** Enable cross-region replication */
  enableReplication?: boolean;
  /** Regions for cross-region replication */
  replicationRegions?: string[];
  /** Enable CloudFront CDN */
  enableCdn?: boolean;
  /** Custom CloudFront behaviors */
  customCacheBehaviors?: Record<string, cloudfront.BehaviorOptions>;
  /** Enable versioning */
  versioned?: boolean;
  /** Encryption type */
  encryption?: s3.BucketEncryption;
  /** Removal policy */
  removalPolicy?: cdk.RemovalPolicy;
  /** Auto delete objects (dev only) */
  autoDeleteObjects?: boolean;
  /** CORS configuration */
  cors?: s3.CorsRule[];
  /** Enable intelligent tiering */
  enableIntelligentTiering?: boolean;
  /** Enable S3 inventory */
  enableInventory?: boolean;
  /** Inventory bucket (required if enableInventory is true) */
  inventoryBucket?: s3.IBucket;
  /** Enable metrics */
  enableMetrics?: boolean;
  /** Log bucket for access logs */
  logBucket?: s3.IBucket;
  /** Log prefix */
  logPrefix?: string;
}

/**
 * Optimized S3 bucket with lifecycle management, intelligent tiering,
 * and optional CloudFront CDN integration
 */
export class OptimizedBucket extends Construct {
  public readonly bucket: s3.Bucket;
  public readonly distribution?: cloudfront.Distribution;
  private readonly dataClassifier: DataClassifier;

  constructor(scope: Construct, id: string, props: OptimizedBucketProps) {
    super(scope, id);

    // Initialize data classifier
    this.dataClassifier = new DataClassifier(props.classificationRules);

    // Determine encryption based on classification
    const encryption = props.encryption ?? this.getEncryptionForClassification(props.dataClassification);

    // Create bucket with intelligent defaults
    this.bucket = new s3.Bucket(this, 'Bucket', {
      bucketName: props.bucketName,
      encryption,
      versioned: props.versioned ?? (props.dataClassification !== DataClassification.PUBLIC),
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: props.removalPolicy ?? cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: props.autoDeleteObjects ?? false,
      cors: props.cors,
      serverAccessLogsBucket: props.logBucket,
      serverAccessLogsPrefix: props.logPrefix,

      // Apply lifecycle rules from data classifier
      lifecycleRules: this.dataClassifier.getLifecycleRules(),

      // Intelligent Tiering configuration for automatic optimization
      ...(props.enableIntelligentTiering !== false && {
        intelligentTieringConfigurations: [
          {
            name: 'auto-tiering',
            archiveAccessTierTime: cdk.Duration.days(90),
            deepArchiveAccessTierTime: cdk.Duration.days(180),
            prefix: 'data/',
            tags: [{ key: 'auto-tier', value: 'true' }],
          },
        ],
      }),

      // Inventory for cost analysis will be configured separately via CfnBucket if needed

      // Metrics for monitoring
      ...(props.enableMetrics !== false && {
        metrics: [
          {
            id: 'entire-bucket',
          },
        ],
      }),
    });

    // Add compliance and cost allocation tags
    this.addComplianceTags(props.dataClassification);

    // Setup cross-region replication if requested
    if (props.enableReplication && props.replicationRegions) {
      this.setupReplication(props.replicationRegions);
    }

    // Setup CloudFront if enabled
    if (props.enableCdn) {
      this.distribution = this.setupCloudFront(props.customCacheBehaviors);
    }
  }

  /**
   * Get encryption type based on data classification
   */
  private getEncryptionForClassification(classification: DataClassification): s3.BucketEncryption {
    switch (classification) {
      case DataClassification.PUBLIC:
      case DataClassification.INTERNAL:
        return s3.BucketEncryption.S3_MANAGED;
      case DataClassification.CONFIDENTIAL:
      case DataClassification.RESTRICTED:
        return s3.BucketEncryption.KMS_MANAGED; // Use KMS for higher security
      default:
        return s3.BucketEncryption.S3_MANAGED;
    }
  }

  /**
   * Setup CloudFront distribution with Origin Access Control
   */
  private setupCloudFront(
    customBehaviors?: Record<string, cloudfront.BehaviorOptions>
  ): cloudfront.Distribution {
    // Create Origin Access Control for secure S3 access
    const oac = new cloudfront.S3OriginAccessControl(this, 'OAC', {
      signing: cloudfront.Signing.SIGV4_ALWAYS,
    });

    // Create S3 origin with OAC
    const s3Origin = origins.S3BucketOrigin.withOriginAccessControl(this.bucket, {
      originAccessControl: oac,
    });

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: s3Origin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
      },

      // Additional cache behaviors for different content types
      additionalBehaviors: customBehaviors ?? this.getDefaultCacheBehaviors(s3Origin),

      priceClass: cloudfront.PriceClass.PRICE_CLASS_100, // Use only North America and Europe
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      enableLogging: true,
      comment: `CDN for ${this.bucket.bucketName}`,
    });

    // Grant CloudFront access to S3 bucket
    this.bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AllowCloudFrontServicePrincipal',
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal('cloudfront.amazonaws.com')],
        actions: ['s3:GetObject'],
        resources: [`${this.bucket.bucketArn}/*`],
        conditions: {
          StringEquals: {
            'AWS:SourceArn': `arn:aws:cloudfront::${cdk.Aws.ACCOUNT_ID}:distribution/${distribution.distributionId}`,
          },
        },
      })
    );

    return distribution;
  }

  /**
   * Get default cache behaviors for different content types
   */
  private getDefaultCacheBehaviors(origin: cloudfront.IOrigin): Record<string, cloudfront.BehaviorOptions> {
    return {
      '/images/*': {
        origin,
        cachePolicy: new cloudfront.CachePolicy(this, 'ImageCache', {
          defaultTtl: cdk.Duration.days(365),
          maxTtl: cdk.Duration.days(365),
          minTtl: cdk.Duration.days(30),
          comment: 'Long cache for images',
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        compress: true,
      },
      '/static/*': {
        origin,
        cachePolicy: new cloudfront.CachePolicy(this, 'StaticCache', {
          defaultTtl: cdk.Duration.days(30),
          maxTtl: cdk.Duration.days(365),
          minTtl: cdk.Duration.days(1),
          comment: 'Medium cache for static assets',
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        compress: true,
      },
    };
  }

  /**
   * Setup cross-region replication
   */
  private setupReplication(regions: string[]): void {
    // Create replication role
    const replicationRole = new iam.Role(this, 'ReplicationRole', {
      assumedBy: new iam.ServicePrincipal('s3.amazonaws.com'),
      description: 'S3 Cross-Region Replication Role',
    });

    // Grant replication permissions
    this.bucket.grantRead(replicationRole);

    // Create replication rules
    const rules: s3.CfnBucket.ReplicationRuleProperty[] = regions.map((region, index) => ({
      id: `replicate-to-${region}`,
      status: 'Enabled',
      priority: index + 1,
      filter: {},
      destination: {
        bucket: `arn:aws:s3:::${this.bucket.bucketName}-replica-${region}`,
        replicationTime: {
          status: 'Enabled',
          time: {
            minutes: 15, // RTC - 15 minute SLA
          },
        },
        metrics: {
          status: 'Enabled',
          eventThreshold: {
            minutes: 15,
          },
        },
        storageClass: 'GLACIER_INSTANT_RETRIEVAL',
      },
      deleteMarkerReplication: {
        status: 'Enabled',
      },
    }));

    // Apply replication configuration
    const cfnBucket = this.bucket.node.defaultChild as s3.CfnBucket;
    cfnBucket.replicationConfiguration = {
      role: replicationRole.roleArn,
      rules,
    };
  }

  /**
   * Add compliance and cost allocation tags
   */
  private addComplianceTags(classification: DataClassification): void {
    cdk.Tags.of(this.bucket).add('DataClassification', classification);
    cdk.Tags.of(this.bucket).add('CostCenter', 'Storage');
    cdk.Tags.of(this.bucket).add('ManagedBy', 'CDK');

    // Add classification-specific tags
    if (classification === DataClassification.CONFIDENTIAL || classification === DataClassification.RESTRICTED) {
      cdk.Tags.of(this.bucket).add('Compliance', 'Required');
      cdk.Tags.of(this.bucket).add('Encryption', 'Required');
    }
  }

  /**
   * Grant read access to a principal
   */
  grantRead(identity: iam.IGrantable): iam.Grant {
    return this.bucket.grantRead(identity);
  }

  /**
   * Grant write access to a principal
   */
  grantWrite(identity: iam.IGrantable): iam.Grant {
    return this.bucket.grantWrite(identity);
  }

  /**
   * Grant read/write access to a principal
   */
  grantReadWrite(identity: iam.IGrantable): iam.Grant {
    return this.bucket.grantReadWrite(identity);
  }
}
