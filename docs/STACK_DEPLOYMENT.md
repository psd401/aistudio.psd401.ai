# CDK Stack Deployment Guide

## Overview

The CDK infrastructure has been refactored to use SSM Parameter Store for cross-stack dependencies, enabling independent deployment of individual stacks. This significantly improves development velocity and reduces deployment costs.

## Stack Dependencies

### Previous Architecture (Cross-Stack References)
- Direct property passing created CloudFormation Export/Import dependencies
- Required deploying all stacks together with `cdk deploy --all`
- Deployment time: ~15-20 minutes for any change

### New Architecture (SSM Parameter Store)
- Cross-stack values stored in SSM Parameter Store
- Stacks can be deployed independently
- Deployment time: ~3-5 minutes per stack

## SSM Parameter Naming Convention

All cross-stack parameters follow this pattern:
```
/aistudio/{environment}/{resource-name}
```

Current parameters:
- `/aistudio/dev/db-cluster-arn` - Aurora cluster ARN
- `/aistudio/dev/db-secret-arn` - Database secret ARN
- `/aistudio/dev/documents-bucket-name` - S3 bucket name
- `/aistudio/prod/db-cluster-arn` - Aurora cluster ARN (prod)
- `/aistudio/prod/db-secret-arn` - Database secret ARN (prod)
- `/aistudio/prod/documents-bucket-name` - S3 bucket name (prod)

## Deployment Order

### Initial Deployment
For a fresh deployment, stacks should be deployed in this order:

1. **AuthStack** - No dependencies
   ```bash
   cdk deploy AIStudio-AuthStack-Dev --context baseDomain=aistudio.psd401.ai
   ```

2. **DatabaseStack** - No dependencies
   ```bash
   cdk deploy AIStudio-DatabaseStack-Dev --context baseDomain=aistudio.psd401.ai
   ```

3. **StorageStack** - No dependencies
   ```bash
   cdk deploy AIStudio-StorageStack-Dev --context baseDomain=aistudio.psd401.ai
   ```

4. **ProcessingStack** - Depends on SSM parameters from Database and Storage
   ```bash
   cdk deploy AIStudio-ProcessingStack-Dev --context baseDomain=aistudio.psd401.ai
   ```

5. **FrontendStack** - Depends on SSM parameter from Storage
   ```bash
   cdk deploy AIStudio-FrontendStack-Dev --context baseDomain=aistudio.psd401.ai
   ```

### Subsequent Deployments
After initial deployment, any stack can be deployed independently:

```bash
# Deploy only the database stack
cdk deploy AIStudio-DatabaseStack-Dev --exclusively --context baseDomain=aistudio.psd401.ai

# Deploy only the frontend stack
cdk deploy AIStudio-FrontendStack-Dev --exclusively --context baseDomain=aistudio.psd401.ai
```

## Using the --exclusively Flag

The `--exclusively` flag prevents CDK from deploying dependent stacks:

```bash
# This will deploy ONLY the specified stack
cdk deploy StackName --exclusively

# Without --exclusively, CDK may deploy dependent stacks
cdk deploy StackName
```

## Troubleshooting

### SSM Parameter Not Found
If you get an error about missing SSM parameters:
1. Ensure the source stack (Database or Storage) has been deployed first
2. Check parameter names match the expected pattern
3. Verify you're in the correct AWS region

### Stack Still Has Dependencies
If a stack still shows dependencies:
1. Check for any remaining CloudFormation Exports/Imports
2. Ensure all cross-stack references use SSM parameters
3. Verify no `addDependency()` calls remain in the code

## Migration Notes

When deploying this change to existing environments:
1. Deploy all stacks together once more with `cdk deploy --all`
2. This creates the SSM parameters alongside existing exports
3. Future deployments can use `--exclusively` for individual stacks
4. Old CloudFormation exports remain for backward compatibility

## Best Practices

1. **Always use SSM parameters** for cross-stack values
2. **Never use** `stack.addDependency()` unless absolutely necessary
3. **Keep parameter names consistent** with the naming convention
4. **Document new parameters** when adding cross-stack dependencies
5. **Test with --exclusively** before committing changes