#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Quick Deploy - Docker image only${NC}"
echo "======================================="
echo "This script builds and pushes the Docker image without CDK deployment"
echo "Useful for rapid testing of application changes"
echo ""

# Check AWS credentials
echo -e "${YELLOW}Checking AWS credentials...${NC}"
if ! aws sts get-caller-identity > /dev/null 2>&1; then
    echo -e "${RED}❌ AWS credentials not configured${NC}"
    exit 1
fi

ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
REGION=$(aws configure get region || echo "us-east-1")
echo -e "${GREEN}✓ AWS Account: $ACCOUNT${NC}"
echo -e "${GREEN}✓ Region: $REGION${NC}"

# Get ECR repository URI
echo -e "\n${YELLOW}Getting ECR repository information...${NC}"
REPO_URI=$(aws ssm get-parameter --name "/aistudio/dev/ecr-repository-uri" --query "Parameter.Value" --output text 2>/dev/null)

if [ -z "$REPO_URI" ]; then
    echo -e "${RED}❌ ECR repository not found${NC}"
    echo "Please deploy the infrastructure first with: ./deploy-ecs-dev.sh"
    exit 1
fi

echo -e "${GREEN}✓ ECR Repository: $REPO_URI${NC}"

# Change to project root
cd "$(dirname "$0")/../.." || exit 1

# Login to ECR
echo -e "\n${YELLOW}🔐 Logging into ECR...${NC}"
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$ACCOUNT.dkr.ecr.$REGION.amazonaws.com"

# Build with BuildKit for speed
echo -e "\n${YELLOW}🔨 Building Docker image...${NC}"
echo "Platform: linux/arm64 (matches ECS Fargate)"
export DOCKER_BUILDKIT=1
docker build --platform linux/arm64 -t aistudio-dev:latest .

# Tag for ECR
echo -e "\n${YELLOW}🏷️  Tagging image...${NC}"
docker tag aistudio-dev:latest "$REPO_URI:latest"

# Push to ECR
echo -e "\n${YELLOW}📤 Pushing to ECR...${NC}"
docker push "$REPO_URI:latest"

# Force new deployment
echo -e "\n${YELLOW}🔄 Updating ECS service...${NC}"
CLUSTER_NAME=$(aws ssm get-parameter --name "/aistudio/dev/ecs-cluster-name" --query "Parameter.Value" --output text 2>/dev/null || echo "aistudio-dev")
SERVICE_NAME=$(aws ssm get-parameter --name "/aistudio/dev/ecs-service-name" --query "Parameter.Value" --output text 2>/dev/null || echo "aistudio-dev")

aws ecs update-service \
    --cluster "$CLUSTER_NAME" \
    --service "$SERVICE_NAME" \
    --force-new-deployment \
    --output table

echo ""
echo "======================================="
echo -e "${GREEN}✅ Deployment initiated!${NC}"
echo "======================================="
echo ""
echo "The ECS service will now pull the new image and deploy it."
echo "This typically takes 2-3 minutes."
echo ""
echo "📊 Monitor deployment:"
echo "  https://console.aws.amazon.com/ecs/v2/clusters/$CLUSTER_NAME/services/$SERVICE_NAME"
echo ""
echo "📋 Watch logs:"
echo "  aws logs tail /ecs/aistudio-dev --follow"
echo ""
echo "🔍 Check deployment status:"
echo "  aws ecs describe-services --cluster $CLUSTER_NAME --services $SERVICE_NAME --query 'services[0].deployments' --output table"
echo ""
