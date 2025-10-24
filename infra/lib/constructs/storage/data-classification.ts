import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cdk from 'aws-cdk-lib';

/**
 * Data classification levels for S3 storage optimization
 */
export enum DataClassification {
  /**
   * Public data - static assets, public content
   * Optimized for cost with aggressive tiering
   */
  PUBLIC = 'public',

  /**
   * Internal data - user uploads, application data
   * Balanced approach with intelligent tiering
   */
  INTERNAL = 'internal',

  /**
   * Confidential data - sensitive information
   * Focus on security and compliance
   */
  CONFIDENTIAL = 'confidential',

  /**
   * Restricted data - highly sensitive
   * Maximum security, long-term retention
   */
  RESTRICTED = 'restricted',
}

/**
 * Data classification rule configuration
 */
export interface DataClassificationRule {
  /** Glob pattern to match object keys */
  pattern: string;
  /** Data classification level */
  classification: DataClassification;
  /** Custom lifecycle rules (overrides defaults) */
  customLifecycle?: s3.LifecycleRule[];
  /** Enable cross-region replication */
  enableReplication?: boolean;
  /** Description of the rule */
  description?: string;
}

/**
 * Default lifecycle policies for each classification level
 */
export class LifecyclePolicyFactory {
  /**
   * Get default lifecycle rules for a data classification
   */
  static getDefaultRules(classification: DataClassification): s3.LifecycleRule[] {
    switch (classification) {
      case DataClassification.PUBLIC:
        return this.getPublicRules();
      case DataClassification.INTERNAL:
        return this.getInternalRules();
      case DataClassification.CONFIDENTIAL:
        return this.getConfidentialRules();
      case DataClassification.RESTRICTED:
        return this.getRestrictedRules();
      default:
        return this.getInternalRules(); // Safe default
    }
  }

  /**
   * Public content lifecycle - aggressive cost optimization
   */
  private static getPublicRules(): s3.LifecycleRule[] {
    return [
      {
        id: 'public-content-lifecycle',
        enabled: true,
        transitions: [
          {
            storageClass: s3.StorageClass.INFREQUENT_ACCESS,
            transitionAfter: cdk.Duration.days(30),
          },
          {
            storageClass: s3.StorageClass.GLACIER_INSTANT_RETRIEVAL,
            transitionAfter: cdk.Duration.days(90),
          },
        ],
      },
      {
        id: 'cleanup-incomplete-uploads',
        enabled: true,
        abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
      },
    ];
  }

  /**
   * Internal data lifecycle - balanced optimization
   */
  private static getInternalRules(): s3.LifecycleRule[] {
    return [
      {
        id: 'internal-data-lifecycle',
        enabled: true,
        transitions: [
          {
            storageClass: s3.StorageClass.INTELLIGENT_TIERING,
            transitionAfter: cdk.Duration.days(0), // Immediate
          },
        ],
        noncurrentVersionTransitions: [
          {
            storageClass: s3.StorageClass.GLACIER,
            transitionAfter: cdk.Duration.days(30),
          },
        ],
        noncurrentVersionExpiration: cdk.Duration.days(365),
      },
      {
        id: 'cleanup-incomplete-uploads',
        enabled: true,
        abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
      },
      {
        id: 'delete-old-versions',
        enabled: true,
        noncurrentVersionExpiration: cdk.Duration.days(90),
        expiredObjectDeleteMarker: true,
      },
    ];
  }

  /**
   * Confidential data lifecycle - security focused
   */
  private static getConfidentialRules(): s3.LifecycleRule[] {
    return [
      {
        id: 'confidential-data-lifecycle',
        enabled: true,
        transitions: [
          {
            storageClass: s3.StorageClass.GLACIER_INSTANT_RETRIEVAL,
            transitionAfter: cdk.Duration.days(90),
          },
          {
            storageClass: s3.StorageClass.DEEP_ARCHIVE,
            transitionAfter: cdk.Duration.days(365),
          },
        ],
        // 7-year retention for compliance
        expiration: cdk.Duration.days(2555),
      },
      {
        id: 'cleanup-incomplete-uploads',
        enabled: true,
        abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
      },
    ];
  }

  /**
   * Restricted data lifecycle - maximum security
   */
  private static getRestrictedRules(): s3.LifecycleRule[] {
    return [
      {
        id: 'restricted-data-lifecycle',
        enabled: true,
        transitions: [
          {
            storageClass: s3.StorageClass.GLACIER_INSTANT_RETRIEVAL,
            transitionAfter: cdk.Duration.days(30),
          },
          {
            storageClass: s3.StorageClass.DEEP_ARCHIVE,
            transitionAfter: cdk.Duration.days(180),
          },
        ],
        // 10-year retention for restricted data
        expiration: cdk.Duration.days(3650),
      },
      {
        id: 'cleanup-incomplete-uploads',
        enabled: true,
        abortIncompleteMultipartUploadAfter: cdk.Duration.days(1),
      },
    ];
  }

  /**
   * Get lifecycle rules for logs with efficient cleanup
   */
  static getLogRules(retentionDays: number = 365): s3.LifecycleRule[] {
    return [
      {
        id: 'log-lifecycle',
        enabled: true,
        transitions: [
          {
            storageClass: s3.StorageClass.INFREQUENT_ACCESS,
            transitionAfter: cdk.Duration.days(7),
          },
          {
            storageClass: s3.StorageClass.GLACIER,
            transitionAfter: cdk.Duration.days(30),
          },
        ],
        expiration: cdk.Duration.days(retentionDays),
      },
    ];
  }

  /**
   * Get lifecycle rules for backup data
   */
  static getBackupRules(retentionDays: number = 2555): s3.LifecycleRule[] {
    return [
      {
        id: 'backup-lifecycle',
        enabled: true,
        transitions: [
          {
            storageClass: s3.StorageClass.GLACIER,
            transitionAfter: cdk.Duration.days(1),
          },
          {
            storageClass: s3.StorageClass.DEEP_ARCHIVE,
            transitionAfter: cdk.Duration.days(90),
          },
        ],
        expiration: cdk.Duration.days(retentionDays),
      },
    ];
  }
}

/**
 * Data classifier for applying classification rules to S3 buckets
 */
export class DataClassifier {
  private rules: DataClassificationRule[];

  constructor(rules?: DataClassificationRule[]) {
    this.rules = rules || this.getDefaultRules();
  }

  /**
   * Get default classification rules
   */
  private getDefaultRules(): DataClassificationRule[] {
    return [
      {
        pattern: 'logs/*',
        classification: DataClassification.INTERNAL,
        customLifecycle: LifecyclePolicyFactory.getLogRules(365),
        description: 'Application and system logs',
      },
      {
        pattern: 'user-uploads/*',
        classification: DataClassification.INTERNAL,
        enableReplication: true,
        description: 'User-uploaded content',
      },
      {
        pattern: 'backups/*',
        classification: DataClassification.CONFIDENTIAL,
        customLifecycle: LifecyclePolicyFactory.getBackupRules(2555),
        enableReplication: true,
        description: 'Database and application backups',
      },
      {
        pattern: 'static-assets/*',
        classification: DataClassification.PUBLIC,
        description: 'Static website assets',
      },
    ];
  }

  /**
   * Get all lifecycle rules for a bucket based on classification rules
   */
  getLifecycleRules(): s3.LifecycleRule[] {
    const rulesMap = new Map<string, s3.LifecycleRule>();

    for (const rule of this.rules) {
      if (rule.customLifecycle) {
        // Use custom lifecycle rules
        for (const lifecycleRule of rule.customLifecycle) {
          if (lifecycleRule.id && !rulesMap.has(lifecycleRule.id)) {
            rulesMap.set(lifecycleRule.id, lifecycleRule);
          }
        }
      } else {
        // Use default rules for classification
        const defaultRules = LifecyclePolicyFactory.getDefaultRules(rule.classification);
        for (const lifecycleRule of defaultRules) {
          if (lifecycleRule.id && !rulesMap.has(lifecycleRule.id)) {
            rulesMap.set(lifecycleRule.id, lifecycleRule);
          }
        }
      }
    }

    return Array.from(rulesMap.values());
  }

  /**
   * Get classification rules that should be replicated
   */
  getReplicationRules(): DataClassificationRule[] {
    return this.rules.filter((rule) => rule.enableReplication);
  }

  /**
   * Add a classification rule
   */
  addRule(rule: DataClassificationRule): void {
    this.rules.push(rule);
  }

  /**
   * Get all classification rules
   */
  getRules(): DataClassificationRule[] {
    return this.rules;
  }
}
