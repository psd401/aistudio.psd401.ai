#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Deploying AI Studio to ECS Dev Environment${NC}"
echo "================================================"

# Check AWS credentials
echo -e "\n${YELLOW}Checking AWS credentials...${NC}"
if ! aws sts get-caller-identity > /dev/null 2>&1; then
    echo -e "${RED}❌ AWS credentials not configured${NC}"
    echo "Please configure AWS CLI with: aws configure"
    exit 1
fi

ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
REGION=$(aws configure get region || echo "us-east-1")
echo -e "${GREEN}✓ AWS Account: $ACCOUNT${NC}"
echo -e "${GREEN}✓ Region: $REGION${NC}"

# Change to infra directory
cd "$(dirname "$0")/.." || exit 1

# Option to skip Docker build for CDK-only changes
SKIP_DOCKER=false
if [ "$1" == "--skip-docker" ] || [ "$1" == "-s" ]; then
    SKIP_DOCKER=true
    echo -e "\n${YELLOW}⚠️  Skipping Docker build (using existing image)${NC}"
fi

# Check if this is first deployment or update
echo -e "\n${YELLOW}Checking deployment status...${NC}"
CLUSTER_EXISTS=$(aws ecs describe-clusters --clusters aistudio-dev --query 'clusters[0].status' --output text 2>/dev/null || echo "NONE")

if [ "$CLUSTER_EXISTS" == "ACTIVE" ]; then
    echo -e "${GREEN}✓ Existing deployment found - performing update${NC}"
    DEPLOYMENT_TYPE="update"
else
    echo -e "${YELLOW}ℹ️  No existing deployment - performing initial deployment${NC}"
    DEPLOYMENT_TYPE="initial"
fi

# Deploy with CDK
echo -e "\n${GREEN}🔧 Deploying infrastructure with CDK...${NC}"
if [ "$SKIP_DOCKER" == "true" ]; then
    echo -e "${YELLOW}Note: CDK will use existing ECR image${NC}"
fi

npx cdk deploy AIStudio-FrontendStack-Dev-Ecs --require-approval never

# Get service info
echo -e "\n${YELLOW}Retrieving service information...${NC}"
CLUSTER_NAME=$(aws ssm get-parameter --name "/aistudio/dev/ecs-cluster-name" --query "Parameter.Value" --output text 2>/dev/null || echo "aistudio-dev")
SERVICE_NAME=$(aws ssm get-parameter --name "/aistudio/dev/ecs-service-name" --query "Parameter.Value" --output text 2>/dev/null || echo "aistudio-dev")

# Wait for deployment to stabilize
echo -e "\n${YELLOW}⏳ Waiting for service to stabilize...${NC}"
echo "This may take a few minutes..."

if aws ecs wait services-stable --cluster "$CLUSTER_NAME" --services "$SERVICE_NAME" 2>/dev/null; then
    echo -e "${GREEN}✅ Service is stable${NC}"
else
    echo -e "${YELLOW}⚠️  Service stabilization wait timed out or failed${NC}"
    echo "Check the ECS console for deployment status"
fi

# Get application URL
ALB_DNS=$(aws ssm get-parameter --name "/aistudio/dev/alb-dns-name" --query "Parameter.Value" --output text 2>/dev/null)

# Get running task count
RUNNING_TASKS=$(aws ecs describe-services --cluster "$CLUSTER_NAME" --services "$SERVICE_NAME" --query 'services[0].runningCount' --output text 2>/dev/null || echo "0")

# Get desired task count
DESIRED_TASKS=$(aws ecs describe-services --cluster "$CLUSTER_NAME" --services "$SERVICE_NAME" --query 'services[0].desiredCount' --output text 2>/dev/null || echo "0")

echo ""
echo "================================================"
echo -e "${GREEN}✅ Deployment complete!${NC}"
echo "================================================"
echo ""
echo "Deployment Type: $DEPLOYMENT_TYPE"
echo "Cluster: $CLUSTER_NAME"
echo "Service: $SERVICE_NAME"
echo "Running Tasks: $RUNNING_TASKS / $DESIRED_TASKS"
echo ""
echo "📊 Monitoring:"
echo "  CloudWatch Dashboard: https://console.aws.amazon.com/cloudwatch/home?region=$REGION#dashboards:name=aistudio-ecs-dev"
echo "  ECS Service: https://console.aws.amazon.com/ecs/v2/clusters/$CLUSTER_NAME/services/$SERVICE_NAME"
echo "  Container Insights: https://console.aws.amazon.com/cloudwatch/home?region=$REGION#container-insights:infrastructure"
echo ""
echo "📋 Logs:"
echo "  aws logs tail /ecs/aistudio-dev --follow"
echo ""
echo "🌐 Load Balancer:"
echo "  http://$ALB_DNS"
echo ""
echo "💡 Quick commands:"
echo "  View service status:  aws ecs describe-services --cluster $CLUSTER_NAME --services $SERVICE_NAME"
echo "  Force new deployment: aws ecs update-service --cluster $CLUSTER_NAME --service $SERVICE_NAME --force-new-deployment"
echo "  Scale service:        aws ecs update-service --cluster $CLUSTER_NAME --service $SERVICE_NAME --desired-count 2"
echo ""
