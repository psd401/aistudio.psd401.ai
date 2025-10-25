/**
 * S3 Storage Optimization Constructs
 *
 * This module provides constructs for optimizing S3 storage costs and performance:
 * - OptimizedBucket: S3 bucket with lifecycle management and optional CloudFront CDN
 * - DataClassification: Framework for classifying data and applying appropriate policies
 * - StorageLensConfig: Comprehensive storage analytics and monitoring
 * - CostMonitor: Automated cost analysis and optimization recommendations
 *
 * @see https://docs.aws.amazon.com/AmazonS3/latest/userguide/storage-class-intro.html
 */

export * from './data-classification';
export * from './optimized-bucket';
export * from './storage-lens';
export * from './cost-monitor';
