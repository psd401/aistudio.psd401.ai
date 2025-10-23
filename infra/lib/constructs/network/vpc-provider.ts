import * as cdk from "aws-cdk-lib"
import * as ec2 from "aws-cdk-lib/aws-ec2"
import * as ssm from "aws-cdk-lib/aws-ssm"
import { Construct } from "constructs"
import { SharedVPC } from "./shared-vpc"
import { IEnvironmentConfig } from "../config/environment-config"

/**
 * VPC Provider for cross-stack VPC sharing.
 *
 * This provider implements the singleton pattern to ensure only one VPC
 * is created per environment, even when multiple stacks need VPC access.
 *
 * Usage in stacks:
 * ```typescript
 * const vpc = VPCProvider.getOrCreate(this, environment, config);
 * ```
 *
 * How it works:
 * 1. First stack creates the VPC and stores ID in SSM Parameter Store
 * 2. Subsequent stacks look up the VPC by ID from SSM
 * 3. If VPC doesn't exist yet, a new one is created
 *
 * Benefits:
 * - Single VPC shared across all stacks (reduces costs)
 * - Automatic cross-stack reference handling
 * - No circular dependencies
 * - Proper cleanup on stack deletion
 *
 * SSM Parameters Created:
 * - /aistudio/{environment}/vpc-id
 * - /aistudio/{environment}/vpc-azs
 * - /aistudio/{environment}/vpc-public-subnet-ids
 * - /aistudio/{environment}/vpc-private-subnet-ids
 * - /aistudio/{environment}/vpc-data-subnet-ids
 * - /aistudio/{environment}/vpc-isolated-subnet-ids
 *
 * @see https://docs.aws.amazon.com/cdk/v2/guide/resources.html#resources_referencing
 */
export class VPCProvider {
  private static vpcInstance: SharedVPC | undefined

  /**
   * Get or create the shared VPC for the environment.
   *
   * This method first checks if a VPC already exists in SSM Parameter Store.
   * If found, it imports the VPC. If not found, it creates a new VPC.
   *
   * @param scope - The construct scope
   * @param environment - The environment name (dev, staging, prod)
   * @param config - The environment configuration
   * @returns The VPC instance
   */
  public static getOrCreate(
    scope: Construct,
    environment: string,
    config: IEnvironmentConfig
  ): ec2.IVpc {
    const stack = cdk.Stack.of(scope)

    // Check if VPC already exists in this CDK app context
    const vpcId = stack.node.tryGetContext(`vpc-${environment}`)

    if (vpcId) {
      // VPC already exists in this synthesis, look it up
      return ec2.Vpc.fromLookup(scope, "SharedVPC", {
        vpcId: vpcId,
      })
    }

    // Check if VPC exists in another stack via SSM
    try {
      const vpcIdFromSsm = ssm.StringParameter.valueForStringParameter(
        scope,
        `/aistudio/${environment}/vpc-id`
      )

      if (vpcIdFromSsm && vpcIdFromSsm !== "dummy-value") {
        // VPC exists, import it
        return this.import(scope, environment)
      }
    } catch {
      // VPC doesn't exist yet, continue to creation
    }

    // Create new VPC if it doesn't exist
    if (!this.vpcInstance) {
      this.vpcInstance = new SharedVPC(scope, "SharedVPC", {
        environment: environment as "dev" | "staging" | "prod",
        config,
        enableFlowLogs: true,
        enableVpcEndpoints: true,
      })

      // Store VPC information in SSM for cross-stack references
      this.storeVpcParameters(scope, environment, this.vpcInstance)

      // Store in CDK context for this synthesis
      stack.node.setContext(
        `vpc-${environment}`,
        this.vpcInstance.vpc.vpcId
      )
    }

    return this.vpcInstance.vpc
  }

  /**
   * Store VPC information in SSM Parameter Store for cross-stack references.
   *
   * This allows other stacks to import the VPC without CloudFormation exports,
   * which can cause circular dependencies and deployment issues.
   */
  private static storeVpcParameters(
    scope: Construct,
    environment: string,
    vpcInstance: SharedVPC
  ): void {
    // Store VPC ID
    new ssm.StringParameter(scope, "VPCIdParameter", {
      parameterName: `/aistudio/${environment}/vpc-id`,
      stringValue: vpcInstance.vpc.vpcId,
      description: "Shared VPC ID for all stacks",
    })

    // Store Availability Zones
    new ssm.StringParameter(scope, "VPCAZsParameter", {
      parameterName: `/aistudio/${environment}/vpc-azs`,
      stringValue: vpcInstance.vpc.availabilityZones.join(","),
      description: "Availability zones for the shared VPC",
    })

    // Store Public Subnet IDs
    new ssm.StringParameter(scope, "VPCPublicSubnetIdsParameter", {
      parameterName: `/aistudio/${environment}/vpc-public-subnet-ids`,
      stringValue: vpcInstance.publicSubnets
        .map((subnet) => subnet.subnetId)
        .join(","),
      description: "Public subnet IDs",
    })

    // Store Private Subnet IDs (Application)
    new ssm.StringParameter(scope, "VPCPrivateSubnetIdsParameter", {
      parameterName: `/aistudio/${environment}/vpc-private-subnet-ids`,
      stringValue: vpcInstance.privateSubnets
        .map((subnet) => subnet.subnetId)
        .join(","),
      description: "Private application subnet IDs",
    })

    // Store Data Subnet IDs
    new ssm.StringParameter(scope, "VPCDataSubnetIdsParameter", {
      parameterName: `/aistudio/${environment}/vpc-data-subnet-ids`,
      stringValue: vpcInstance.dataSubnets
        .map((subnet) => subnet.subnetId)
        .join(","),
      description: "Private data subnet IDs for databases",
    })

    // Store Isolated Subnet IDs
    new ssm.StringParameter(scope, "VPCIsolatedSubnetIdsParameter", {
      parameterName: `/aistudio/${environment}/vpc-isolated-subnet-ids`,
      stringValue: vpcInstance.isolatedSubnets
        .map((subnet) => subnet.subnetId)
        .join(","),
      description: "Isolated subnet IDs for sensitive workloads",
    })

    // Store CIDR block
    new ssm.StringParameter(scope, "VPCCidrParameter", {
      parameterName: `/aistudio/${environment}/vpc-cidr`,
      stringValue: vpcInstance.vpc.vpcCidrBlock,
      description: "VPC CIDR block",
    })
  }

  /**
   * Import existing VPC from SSM Parameter Store.
   *
   * This method reads VPC information from SSM and creates a VPC reference
   * that can be used by other stacks.
   *
   * @param scope - The construct scope
   * @param environment - The environment name
   * @returns The imported VPC
   */
  public static import(scope: Construct, environment: string): ec2.IVpc {
    const vpcId = ssm.StringParameter.valueForStringParameter(
      scope,
      `/aistudio/${environment}/vpc-id`
    )

    const availabilityZones = ssm.StringParameter.valueForStringParameter(
      scope,
      `/aistudio/${environment}/vpc-azs`
    ).split(",")

    const publicSubnetIds = ssm.StringParameter.valueForStringParameter(
      scope,
      `/aistudio/${environment}/vpc-public-subnet-ids`
    ).split(",")

    const privateSubnetIds = ssm.StringParameter.valueForStringParameter(
      scope,
      `/aistudio/${environment}/vpc-private-subnet-ids`
    ).split(",")

    const isolatedSubnetIds = ssm.StringParameter.valueForStringParameter(
      scope,
      `/aistudio/${environment}/vpc-isolated-subnet-ids`
    ).split(",")

    return ec2.Vpc.fromVpcAttributes(scope, "ImportedVPC", {
      vpcId,
      availabilityZones,
      publicSubnetIds,
      privateSubnetIds,
      isolatedSubnetIds,
    })
  }

  /**
   * Check if a VPC exists for the given environment.
   *
   * This is useful for conditional logic or validation before attempting
   * to create or import a VPC.
   *
   * @param scope - The construct scope
   * @param environment - The environment name
   * @returns True if VPC exists, false otherwise
   */
  public static exists(scope: Construct, environment: string): boolean {
    try {
      const vpcId = ssm.StringParameter.valueForStringParameter(
        scope,
        `/aistudio/${environment}/vpc-id`
      )
      return vpcId !== "" && vpcId !== "dummy-value"
    } catch {
      return false
    }
  }
}
