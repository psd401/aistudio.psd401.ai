import * as s3 from "aws-cdk-lib/aws-s3"
import * as ssm from "aws-cdk-lib/aws-ssm"
import * as cdk from "aws-cdk-lib"
import { Construct } from "constructs"
import { BaseStack, BaseStackProps } from "../constructs/base/base-stack"

export interface StorageStackV2Props extends BaseStackProps {
  // Add any additional storage-specific props here
}

export class StorageStackV2 extends BaseStack {
  private _documentsBucketName: string = ""

  public get documentsBucketName(): string {
    return this._documentsBucketName
  }

  protected defineResources(props: StorageStackV2Props): void {
    // S3 bucket for document storage
    const bucket = new s3.Bucket(this, "DocumentsBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      removalPolicy: this.getRemovalPolicy(),
      autoDeleteObjects: this.environment !== "prod",
      lifecycleRules: [
        {
          id: "ExpireDeletedObjects",
          enabled: true,
          expiration: this.config.database.backupRetention, // Use config for consistency
          noncurrentVersionExpiration: this.config.database.backupRetention,
        },
      ],
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.POST,
            s3.HttpMethods.HEAD,
          ],
          allowedOrigins: [
            this.environment === "prod"
              ? "https://aistudio.psd401.ai"
              : "https://dev.aistudio.psd401.ai",
            "http://localhost:3000", // For local development
          ],
          allowedHeaders: ["*"],
          exposedHeaders: ["ETag"],
          maxAge: 3000,
        },
      ],
    })

    // Store bucket name for use by other stacks
    this._documentsBucketName = bucket.bucketName

    // Use BaseStack's createParameter helper for consistency
    this.createParameter(
      "documents-bucket-name",
      bucket.bucketName,
      "S3 bucket name for document storage"
    )

    // Keep CloudFormation output for backward compatibility and monitoring
    new cdk.CfnOutput(this, "DocumentsBucketName", {
      value: bucket.bucketName,
      description: "S3 bucket for document storage",
      exportName: `${this.environment}-DocumentsBucketName`,
    })
  }
}
