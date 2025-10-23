# Base CDK Constructs Library

**Part of Epic #372 - CDK Infrastructure Optimization**

This library provides reusable AWS CDK constructs that eliminate 70%+ of code duplication across our infrastructure. It implements AWS CDK best practices for 2025 and enables rapid addition of new environments while maintaining consistency.

## 📚 Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Core Components](#core-components)
- [Usage Examples](#usage-examples)
- [Testing](#testing)
- [Migration Guide](#migration-guide)
- [Best Practices](#best-practices)

## Overview

### Key Benefits

- **70% Code Reduction**: Eliminates massive duplication in infrastructure code
- **Automatic Tagging**: All resources tagged consistently without manual effort
- **Type-Safe Configuration**: Centralized environment-specific settings
- **Consistent Patterns**: Same behavior across all stacks and environments
- **AWS Best Practices**: Aligned with Well-Architected Framework 2025

### What's Included

1. **BaseStack** - Abstract base class with common stack behaviors
2. **TaggingAspect** - Automatic resource tagging via CDK Aspects
3. **EnvironmentConfig** - Centralized, type-safe configuration
4. **LambdaConstruct** - Reusable Lambda function patterns
5. **Example Stacks** - Migration examples and patterns

## Quick Start

### Installation

The constructs library is already part of the infra package. Simply import what you need:

```typescript
import {
  BaseStack,
  BaseStackProps,
  EnvironmentConfig,
  LambdaConstruct,
} from "./constructs"
```

### Basic Usage

```typescript
import * as cdk from "aws-cdk-lib"
import { BaseStack, BaseStackProps, EnvironmentConfig } from "./constructs"

export class MyStack extends BaseStack {
  protected defineResources(props: BaseStackProps): void {
    // Create your resources here
    const bucket = new cdk.aws_s3.Bucket(this, "MyBucket", {
      removalPolicy: this.getRemovalPolicy(), // Auto RETAIN for prod, DESTROY for dev
    })

    // Use config for environment-specific values
    if (this.config.monitoring.detailedMetrics) {
      // Add detailed CloudWatch metrics
    }

    // Create SSM parameter for cross-stack references
    this.createParameter("bucket-name", bucket.bucketName)
  }
}

// Usage
const devStack = new MyStack(app, "MyStack-Dev", {
  deploymentEnvironment: "dev",
  config: EnvironmentConfig.get("dev"),
  env: { account: "...", region: "..." },
})

// That's it! Automatic tagging, outputs, and configuration applied!
```

## Core Components

### 1. BaseStack

Abstract base class that provides common stack functionality.

**Features:**
- Automatic resource tagging (no manual `cdk.Tags.of()` calls)
- Environment-specific configuration
- Consistent naming conventions
- Standard CloudFormation outputs
- Helper methods for common patterns

**Usage:**

```typescript
export interface MyStackProps extends BaseStackProps {
  // Add stack-specific props
  customSetting?: string
}

export class MyStack extends BaseStack {
  protected defineResources(props: MyStackProps): void {
    // Use this.deploymentEnvironment to check environment
    // Use this.config to access configuration
    // Use this.getRemovalPolicy() for environment-aware policies
    // Use this.getEnvValue(devVal, prodVal) for conditional values
  }
}
```

**Helper Methods:**

| Method | Description | Example |
|--------|-------------|---------|
| `getRemovalPolicy()` | Returns RETAIN for prod, DESTROY otherwise | `removalPolicy: this.getRemovalPolicy()` |
| `getEnvValue<T>(devVal, prodVal)` | Returns value based on environment | `timeout: this.getEnvValue(Duration.seconds(30), Duration.minutes(5))` |
| `createParameter(name, value, desc?)` | Creates SSM parameter with consistent naming | `this.createParameter("db-endpoint", endpoint)` |

### 2. TaggingAspect

Automatically applies comprehensive tags to all taggable resources.

**Applied Tags:**

| Tag | Description | Example Value |
|-----|-------------|---------------|
| `Environment` | Capitalized environment name | `Dev`, `Prod` |
| `Project` | Project name | `AIStudio` |
| `Owner` | Team or owner | `TSD Engineering` |
| `Stack` | Stack name | `AIStudio-DatabaseStack-Dev-dev` |
| `ManagedBy` | Management tool | `CDK` |
| `DeployedAt` | Deployment timestamp | `2025-01-15T10:30:00Z` |
| `CostCenter` | Cost allocation | `PROD-001`, `DEV-001` |
| `BusinessUnit` | Business unit | `Technology` |
| `DataClassification` | Data sensitivity | `Sensitive`, `Internal`, `Public` |
| `Compliance` | Compliance requirement | `Required` (prod), `None` (dev) |

**Data Classification Logic:**
- Database resources → `Sensitive`
- Secrets → `Sensitive`
- Logs → `Internal`
- Other resources → `Public`

### 3. EnvironmentConfig

Centralized configuration for environment-specific settings.

**Configuration Categories:**

```typescript
interface IEnvironmentConfig {
  database: DatabaseConfig       // Aurora, RDS settings
  compute: ComputeConfig         // Lambda, ECS settings
  monitoring: MonitoringConfig   // CloudWatch, X-Ray settings
  network: NetworkConfig         // VPC, NAT, endpoints
  costOptimization: boolean      // Cost optimization flag
}
```

**Environment Comparisons:**

| Setting | Dev | Staging | Prod | Purpose |
|---------|-----|---------|------|---------|
| `database.minCapacity` | 0.5 ACU | 1 ACU | 2 ACU | Cost vs performance |
| `database.autoPause` | `true` | `false` | `false` | Dev can pause |
| `compute.lambdaMemory` | 1024 MB | 2048 MB | 3008 MB | Performance scaling |
| `compute.ecsFargateSpot` | `true` | `true` | `false` | Cost savings |
| `monitoring.detailedMetrics` | `false` | `true` | `true` | Observability |
| `network.natGateways` | 1 | 2 | 3 | HA vs cost |

**Usage:**

```typescript
// Get configuration
const devConfig = EnvironmentConfig.get("dev")

// Access values
devConfig.database.minCapacity // 0.5
devConfig.compute.lambdaMemory // 1024

// Override (rare, usually not needed)
EnvironmentConfig.override("dev", {
  compute: {
    lambdaMemory: 2048,
    // ... other compute fields required
  },
})
```

### 4. LambdaConstruct

Reusable Lambda function construct with best practices built-in.

**Features:**
- Automatic ARM64 (Graviton2) architecture
- Environment-specific memory and timeout
- Automatic X-Ray tracing (when enabled in config)
- Connection reuse optimization
- Log group with retention policies
- Bundling support for Node.js

**Usage:**

```typescript
const lambda = new LambdaConstruct(this, "MyFunction", {
  functionName: "my-function",
  handler: "index.handler",
  codePath: "./lambda",
  environment: {
    TABLE_NAME: table.tableName,
  },
  config: this.config,
  vpc: this.vpc, // Optional
})

// Grant permissions
lambda.function.addToRolePolicy(/*...*/)
lambda.grantInvoke(someRole)
```

## Usage Examples

### Example 1: Storage Stack

```typescript
export class StorageStackV2 extends BaseStack {
  public readonly documentsBucketName: string

  protected defineResources(props: BaseStackProps): void {
    const bucket = new cdk.aws_s3.Bucket(this, "DocumentsBucket", {
      encryption: cdk.aws_s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      removalPolicy: this.getRemovalPolicy(),
      autoDeleteObjects: this.deploymentEnvironment !== "prod",
      lifecycleRules: [{
        expiration: this.config.database.backupRetention, // Reuse config
      }],
    })

    this.documentsBucketName = bucket.bucketName
    this.createParameter("documents-bucket-name", bucket.bucketName)
  }
}
```

### Example 2: Lambda Function Stack

```typescript
export class ProcessingStack extends BaseStack {
  protected defineResources(props: BaseStackProps): void {
    // Lambda with automatic optimization
    const processor = new LambdaConstruct(this, "Processor", {
      functionName: `processor-${this.deploymentEnvironment}`,
      handler: "index.handler",
      codePath: "./lambda/processor",
      environment: {
        ENVIRONMENT: this.deploymentEnvironment,
      },
      config: this.config,
      // Memory and timeout come from config automatically
    })

    // Environment-specific concurrency
    if (this.deploymentEnvironment === "prod") {
      processor.function.addReservedConcurrentExecutions(10)
    }
  }
}
```

### Example 3: Database Stack

```typescript
export class DatabaseStack extends BaseStack {
  public readonly cluster: cdk.aws_rds.DatabaseCluster

  protected defineResources(props: BaseStackProps): void {
    this.cluster = new cdk.aws_rds.ServerlessCluster(this, "Database", {
      engine: cdk.aws_rds.DatabaseClusterEngine.AURORA_POSTGRESQL,
      scaling: {
        minCapacity: this.config.database.minCapacity,
        maxCapacity: this.config.database.maxCapacity,
        autoPause: this.config.database.autoPause
          ? cdk.Duration.minutes(5)
          : undefined,
      },
      deletionProtection: this.config.database.deletionProtection,
      backupRetention: this.config.database.backupRetention,
    })

    this.createParameter("db-endpoint", this.cluster.clusterEndpoint.hostname)
  }
}
```

## Testing

### Running Tests

```bash
# Run all tests
cd infra && npm test

# Run specific test file
npm test -- base-stack.test.ts

# Run with coverage
npm test -- --coverage
```

### Test Coverage

The library includes comprehensive unit tests:

- ✅ `base-stack.test.ts` - 60+ tests for BaseStack
- ✅ `tagging-aspect.test.ts` - 40+ tests for TaggingAspect
- ✅ `environment-config.test.ts` - 50+ tests for EnvironmentConfig

**Coverage Targets:**
- Line Coverage: >90%
- Branch Coverage: >85%
- Function Coverage: >90%

### Writing Tests for Your Stacks

```typescript
import { App } from "aws-cdk-lib"
import { Template } from "aws-cdk-lib/assertions"
import { MyStack } from "../lib/stacks/my-stack"
import { EnvironmentConfig } from "../lib/constructs"

describe("MyStack", () => {
  test("creates expected resources", () => {
    const app = new App()
    const stack = new MyStack(app, "TestStack", {
      deploymentEnvironment: "dev",
      config: EnvironmentConfig.get("dev"),
    })

    const template = Template.fromStack(stack)

    template.hasResourceProperties("AWS::S3::Bucket", {
      // Expect tags to be applied automatically
      Tags: expect.arrayContaining([
        { Key: "Environment", Value: "Dev" },
      ]),
    })
  })
})
```

## Migration Guide

### Step 1: Update Stack Interface

**Before:**
```typescript
export interface MyStackProps extends cdk.StackProps {
  environment: 'dev' | 'prod'
}
```

**After:**
```typescript
export interface MyStackProps extends BaseStackProps {
  // Add any stack-specific props here
}
```

### Step 2: Extend BaseStack

**Before:**
```typescript
export class MyStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: MyStackProps) {
    super(scope, id, props)
    // Resources here
  }
}
```

**After:**
```typescript
export class MyStack extends BaseStack {
  protected defineResources(props: MyStackProps): void {
    // Resources here
  }
}
```

### Step 3: Remove Manual Operations

Remove:
- ❌ All `cdk.Tags.of(stack).add()` calls
- ❌ Manual `removalPolicy` conditionals
- ❌ Hardcoded environment-specific values
- ❌ Manual SSM parameter creation patterns

Replace with:
- ✅ `this.getRemovalPolicy()`
- ✅ `this.config.database.minCapacity` (and other config values)
- ✅ `this.createParameter(name, value)`

### Step 4: Update Stack Instantiation

**Before:**
```typescript
const devStack = new MyStack(app, 'MyStack-Dev', {
  environment: 'dev',
  env: { account: '...', region: '...' },
})
cdk.Tags.of(devStack).add('Environment', 'Dev')
cdk.Tags.of(devStack).add('Project', 'AIStudio')
cdk.Tags.of(devStack).add('Owner', 'TSD Engineering')
```

**After:**
```typescript
const devStack = new MyStack(app, 'MyStack-Dev', {
  environment: 'dev',
  config: EnvironmentConfig.get('dev'),
  env: { account: '...', region: '...' },
})
// Tags applied automatically!
```

### Step 5: Verify

1. Run `npm run build` - Should compile without errors
2. Run `npm test` - All tests should pass
3. Run `cdk diff` - Review changes before deploying
4. Deploy to dev first: `cdk deploy MyStack-Dev`

## Best Practices

### 1. Always Use BaseStack

Every stack should extend `BaseStack` instead of `cdk.Stack`:

```typescript
// ✅ Good
export class MyStack extends BaseStack

// ❌ Bad
export class MyStack extends cdk.Stack
```

### 2. Use Config for Environment-Specific Values

```typescript
// ✅ Good - Uses centralized configuration
const memory = this.config.compute.lambdaMemory

// ❌ Bad - Hardcoded environment checks
const memory = this.deploymentEnvironment === 'prod' ? 3008 : 1024
```

### 3. Use Helper Methods

```typescript
// ✅ Good
removalPolicy: this.getRemovalPolicy()

// ❌ Bad
removalPolicy: this.deploymentEnvironment === 'prod'
  ? cdk.RemovalPolicy.RETAIN
  : cdk.RemovalPolicy.DESTROY
```

### 4. Never Add Tags Manually

```typescript
// ✅ Good - Tags added automatically by BaseStack

// ❌ Bad - Manual tagging
cdk.Tags.of(resource).add('Environment', this.deploymentEnvironment)
```

### 5. Use createParameter for Cross-Stack References

```typescript
// ✅ Good
this.createParameter('bucket-name', bucket.bucketName)

// ❌ Bad
new cdk.aws_ssm.StringParameter(this, 'BucketParam', {
  parameterName: `/manually/created/path`,
  stringValue: bucket.bucketName,
})
```

### 6. Leverage Type Safety

```typescript
// ✅ Good - TypeScript will catch errors
const config: IEnvironmentConfig = EnvironmentConfig.get('dev')

// ❌ Bad - No type safety
const config = { minCapacity: 0.5, /* ... */ }
```

## Architecture Decisions

### Why CDK Aspects for Tagging?

- **Automatic Application**: Tags applied to all resources without manual effort
- **Consistent**: No risk of forgetting to tag resources
- **Maintainable**: Single source of truth for tagging logic
- **Flexible**: Can apply different tags based on resource type

### Why Static Configuration?

- **Type Safety**: TypeScript enforces correct configuration structure
- **Single Source of Truth**: All environments configured in one place
- **Version Controlled**: Configuration changes tracked in Git
- **Fast**: No external API calls or file I/O

### Why Abstract defineResources()?

- **Consistent Initialization**: BaseStack handles common setup before resources
- **Prevents Errors**: Can't forget to call `super()` correctly
- **Clean Separation**: Infrastructure setup separate from resource definition

## Future Enhancements

Planned additions to the constructs library:

- [ ] **VPCConstruct** - Shared VPC configuration with proper segmentation
- [ ] **MonitoringConstruct** - Standard CloudWatch dashboards and alarms
- [ ] **ApiConstruct** - API Gateway with WAF and throttling
- [ ] **DatabaseConstruct** - Aurora Serverless v2 with best practices
- [ ] **CdnConstruct** - CloudFront with standard security headers
- [ ] **StackFactory** - Automated multi-environment stack creation

## Contributing

When adding new constructs:

1. Follow existing patterns (see `BaseStack` and `LambdaConstruct`)
2. Add comprehensive unit tests (>90% coverage)
3. Document in this README with examples
4. Update the index.ts export file
5. Add to the example-usage.ts file

## Support

For questions or issues:

1. Check the [example-usage.ts](../stacks/example-usage.ts) file
2. Review existing stack migrations (e.g., `StorageStackV2`)
3. Consult Epic #372 for overall architecture context
4. Ask in #infrastructure Slack channel

---

**Part of Epic #372: CDK Infrastructure Optimization**
*Last Updated: January 2025*
