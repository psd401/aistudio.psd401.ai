import * as cdk from "aws-cdk-lib"
import * as lambda from "aws-cdk-lib/aws-lambda"
import { Construct } from "constructs"
import * as path from "path"

/**
 * Props for SecretCacheLayer construct
 */
export interface SecretCacheLayerProps {
  /**
   * Description for the layer
   * @default "Secret cache layer for AWS Lambda"
   */
  readonly description?: string

  /**
   * Compatible Lambda runtimes
   * @default [NODEJS_18_X, NODEJS_20_X]
   */
  readonly compatibleRuntimes?: lambda.Runtime[]

  /**
   * Layer name
   * @default "secret-cache-layer"
   */
  readonly layerName?: string
}

/**
 * Lambda Layer for Secret Caching
 *
 * Provides the secret-cache module as a Lambda layer that can be attached
 * to any Lambda function to enable in-memory secret caching.
 *
 * Features:
 * - Automatic bundling of TypeScript code
 * - Compatible with Node.js 18 and 20 runtimes
 * - Includes all necessary dependencies
 * - Versioned for cache busting
 *
 * @example
 * ```typescript
 * const secretCacheLayer = new SecretCacheLayer(this, 'SecretCacheLayer')
 *
 * const myFunction = new lambda.Function(this, 'MyFunction', {
 *   // ... other props
 *   layers: [secretCacheLayer.layer]
 * })
 * ```
 */
export class SecretCacheLayer extends Construct {
  public readonly layer: lambda.LayerVersion

  constructor(scope: Construct, id: string, props: SecretCacheLayerProps = {}) {
    super(scope, id)

    // Point directly to the nodejs directory which contains the pre-built layer
    // The layer must already be built (npm install && npm run build) before deployment
    const layerPath = path.join(__dirname, "../../../lambdas/layers/secret-cache/nodejs")

    this.layer = new lambda.LayerVersion(this, "Layer", {
      code: lambda.Code.fromAsset(layerPath),
      compatibleRuntimes:
        props.compatibleRuntimes || [lambda.Runtime.NODEJS_18_X, lambda.Runtime.NODEJS_20_X],
      description: props.description || "Secret cache layer for AWS Lambda",
      layerVersionName: props.layerName || "secret-cache-layer",
    })

    // Output the layer ARN
    new cdk.CfnOutput(this, "LayerArn", {
      value: this.layer.layerVersionArn,
      description: "ARN of the Secret Cache Lambda Layer",
      exportName: `${cdk.Stack.of(this).stackName}-SecretCacheLayerArn`,
    })
  }
}
