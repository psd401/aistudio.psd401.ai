#!/bin/bash

# CDK Stack Deployment Test Script
# This script helps verify the SSM parameter changes work correctly

set -e  # Exit on error

echo "🔍 CDK Stack Deployment Test Script"
echo "===================================="
echo ""

# Check if baseDomain is provided
if [ -z "$1" ]; then
    echo "Usage: ./test-deployment.sh <baseDomain>"
    echo "Example: ./test-deployment.sh aistudio.psd401.ai"
    exit 1
fi

BASEDOMAIN=$1
ENVIRONMENT=${2:-dev}  # Default to dev if not specified

echo "📋 Testing deployment for environment: $ENVIRONMENT"
echo "📋 Base domain: $BASEDOMAIN"
echo ""

# Function to check if a command succeeded
check_status() {
    if [ $? -eq 0 ]; then
        echo "✅ $1"
    else
        echo "❌ $1"
        exit 1
    fi
}

# 1. Test synthesis of all stacks
echo "1️⃣ Testing CDK synthesis..."
npx cdk synth --all --context baseDomain=$BASEDOMAIN > /dev/null 2>&1
check_status "All stacks synthesize correctly"
echo ""

# 2. Check what will change in each stack
echo "2️⃣ Checking changes for each stack..."
STACKS=(
    "AIStudio-DatabaseStack-Dev"
    "AIStudio-StorageStack-Dev"
    "AIStudio-ProcessingStack-Dev"
    "AIStudio-FrontendStack-Dev"
)

for STACK in "${STACKS[@]}"; do
    echo "   Checking $STACK..."
    npx cdk diff $STACK --context baseDomain=$BASEDOMAIN 2>&1 | grep -E "\[[\+\-\~]\]" | head -5 || echo "   No changes detected"
done
echo ""

# 3. Verify SSM parameters will be created
echo "3️⃣ Expected SSM parameters to be created:"
echo "   - /aistudio/$ENVIRONMENT/db-cluster-arn"
echo "   - /aistudio/$ENVIRONMENT/db-secret-arn"
echo "   - /aistudio/$ENVIRONMENT/documents-bucket-name"
echo ""

# 4. Test deployment order simulation
echo "4️⃣ Simulating deployment order (dry run)..."
echo "   Order for initial deployment:"
echo "   1. AuthStack (no dependencies)"
echo "   2. DatabaseStack (no dependencies)"
echo "   3. StorageStack (no dependencies)"
echo "   4. ProcessingStack (depends on SSM from Database & Storage)"
echo "   5. FrontendStack (depends on SSM from Storage)"
echo ""

# 5. Check for any remaining cross-stack references
echo "5️⃣ Checking for remaining cross-stack dependencies..."
grep -n "addDependency" bin/infra.ts || echo "✅ No explicit dependencies found"
grep -n "documentsBucketName:" bin/infra.ts | grep -v "//" || echo "✅ No bucket name props passed"
grep -n "databaseResourceArn:" bin/infra.ts | grep -v "//" || echo "✅ No database ARN props passed"
echo ""

# 6. Deployment commands
echo "6️⃣ Deployment commands to run:"
echo ""
echo "   First deployment (all stacks together to create SSM parameters):"
echo "   npx cdk deploy --all --context baseDomain=$BASEDOMAIN"
echo ""
echo "   Future deployments (individual stacks):"
echo "   npx cdk deploy AIStudio-DatabaseStack-Dev --exclusively --context baseDomain=$BASEDOMAIN"
echo "   npx cdk deploy AIStudio-StorageStack-Dev --exclusively --context baseDomain=$BASEDOMAIN"
echo "   npx cdk deploy AIStudio-ProcessingStack-Dev --exclusively --context baseDomain=$BASEDOMAIN"
echo "   npx cdk deploy AIStudio-FrontendStack-Dev --exclusively --context baseDomain=$BASEDOMAIN"
echo ""

# 7. Post-deployment verification
echo "7️⃣ After deployment, verify SSM parameters with:"
echo "   aws ssm get-parameters-by-path --path '/aistudio/$ENVIRONMENT' --recursive"
echo ""

echo "✅ Pre-deployment tests completed successfully!"
echo ""
echo "⚠️  IMPORTANT: For the first deployment after this change:"
echo "   1. Deploy all stacks together: npx cdk deploy --all --context baseDomain=$BASEDOMAIN"
echo "   2. This creates SSM parameters while maintaining existing exports"
echo "   3. Future deployments can use --exclusively for individual stacks"
echo ""