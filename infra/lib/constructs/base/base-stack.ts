import * as cdk from "aws-cdk-lib"
import { Construct } from "constructs"
import { TaggingAspect } from "./tagging-aspect"
import { IEnvironmentConfig } from "../config/environment-config"

export interface BaseStackProps extends cdk.StackProps {
  environment: "dev" | "staging" | "prod"
  config: IEnvironmentConfig
  projectName?: string
  owner?: string
}

export abstract class BaseStack extends cdk.Stack {
  public readonly environment: string
  public readonly config: IEnvironmentConfig
  protected readonly projectName: string

  constructor(scope: Construct, id: string, props: BaseStackProps) {
    super(scope, id, {
      ...props,
      stackName: `${props.projectName || "AIStudio"}-${id}-${props.environment}`,
      description: `${id} for ${props.environment} environment`,
      terminationProtection: props.environment === "prod",
    })

    this.environment = props.environment
    this.config = props.config
    this.projectName = props.projectName || "AIStudio"

    // Apply tagging aspect automatically
    cdk.Aspects.of(this).add(
      new TaggingAspect({
        environment: props.environment,
        projectName: this.projectName,
        owner: props.owner || "TSD Engineering",
        stackName: this.stackName,
      })
    )

    // Add standard outputs
    this.addStandardOutputs()

    // Call abstract initialization method
    this.defineResources(props)
  }

  /**
   * Abstract method that child classes must implement to define their resources
   */
  protected abstract defineResources(props: BaseStackProps): void

  /**
   * Helper method to get environment-specific values
   */
  protected getEnvValue<T>(devValue: T, prodValue: T): T {
    return this.environment === "prod" ? prodValue : devValue
  }

  /**
   * Helper to determine removal policy based on environment
   */
  protected getRemovalPolicy(): cdk.RemovalPolicy {
    return this.environment === "prod"
      ? cdk.RemovalPolicy.RETAIN
      : cdk.RemovalPolicy.DESTROY
  }

  /**
   * Add standard CloudFormation outputs
   */
  private addStandardOutputs(): void {
    new cdk.CfnOutput(this, "StackEnvironment", {
      value: this.environment,
      description: "Environment for this stack",
      exportName: `${this.stackName}-Environment`,
    })

    new cdk.CfnOutput(this, "StackVersion", {
      value: process.env.CDK_VERSION || "unknown",
      description: "CDK version used for deployment",
    })
  }

  /**
   * Helper to create SSM parameters for cross-stack references
   */
  protected createParameter(
    name: string,
    value: string,
    description?: string
  ): void {
    new cdk.aws_ssm.StringParameter(this, `${name}Param`, {
      parameterName: `/${this.projectName.toLowerCase()}/${this.environment}/${name}`,
      stringValue: value,
      description: description || `${name} for ${this.stackName}`,
    })
  }
}
