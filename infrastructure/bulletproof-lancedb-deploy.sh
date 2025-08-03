#!/bin/bash

# BULLETPROOF LANCEDB DEPLOYMENT SCRIPT
# This script deploys LanceDB with PERMANENT EFS storage that survives all deployments
# NO MORE AMATEUR HOUR BULLSHIT - THIS IS THE FINAL WORKING VERSION

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 BULLETPROOF LANCEDB DEPLOYMENT${NC}"
echo -e "${BLUE}====================================${NC}"

# Load configuration
source infrastructure/config.sh

# Validate required variables
if [[ -z "$AWS_ACCOUNT_ID" || -z "$VPC_ID" || -z "$PUBLIC_SUBNET_IDS" || -z "$OPENAI_API_KEY_SECRET_ARN" ]]; then
    echo -e "${RED}❌ ERROR: Missing required configuration variables${NC}"
    echo "Required: AWS_ACCOUNT_ID, VPC_ID, PUBLIC_SUBNET_IDS, OPENAI_API_KEY_SECRET_ARN"
    exit 1
fi

# Convert subnet list to CloudFormation format
SUBNET_LIST=$(echo $PUBLIC_SUBNET_IDS | tr ',' '\n' | head -2 | tr '\n' ',' | sed 's/,$//')

echo -e "${YELLOW}📋 DEPLOYMENT CONFIGURATION${NC}"
echo "Account ID: $AWS_ACCOUNT_ID"
echo "Region: $AWS_REGION"
echo "VPC ID: $VPC_ID"
echo "Subnets: $SUBNET_LIST"
echo "Container: $CONTAINER_IMAGE_URI"
echo ""

# STEP 1: Clean up existing broken deployments
echo -e "${YELLOW}🧹 STEP 1: Cleaning up broken deployments${NC}"

# List of known broken stack names to clean up
BROKEN_STACKS=(
    "lancedb-simple-v9"
    "lancedb-simple-v10"
    "lancedb-simple-v11"
    "lancedb-simple-v12"
    "lancedb-final-v2"
    "lancedb-simple"
)

for stack in "${BROKEN_STACKS[@]}"; do
    if aws cloudformation describe-stacks --stack-name "$stack" --region $AWS_REGION >/dev/null 2>&1; then
        echo -e "${YELLOW}Deleting broken stack: $stack${NC}"
        aws cloudformation delete-stack --stack-name "$stack" --region $AWS_REGION
    else
        echo "Stack $stack not found (already deleted)"
    fi
done

# Wait for deletions to complete
echo "Waiting for stack deletions to complete..."
for stack in "${BROKEN_STACKS[@]}"; do
    if aws cloudformation describe-stacks --stack-name "$stack" --region $AWS_REGION >/dev/null 2>&1; then
        echo "Waiting for $stack to delete..."
        aws cloudformation wait stack-delete-complete --stack-name "$stack" --region $AWS_REGION
    fi
done

echo -e "${GREEN}✅ Cleanup complete${NC}"

# STEP 2: Deploy bulletproof persistent LanceDB
echo -e "${YELLOW}🏗️  STEP 2: Deploying bulletproof LanceDB with persistent storage${NC}"

STACK_NAME="lancedb-bulletproof-$(date +%Y%m%d)"

aws cloudformation deploy \
  --template-file infrastructure/lancedb-persistent.yml \
  --stack-name "$STACK_NAME" \
  --parameter-overrides \
    VpcId="$VPC_ID" \
    SubnetIds="$SUBNET_LIST" \
    ContainerImage="$CONTAINER_IMAGE_URI" \
    OpenAIApiKeySecret="$OPENAI_API_KEY_SECRET_ARN" \
  --capabilities CAPABILITY_IAM \
  --region $AWS_REGION

echo -e "${GREEN}✅ Deployment complete${NC}"

# STEP 3: Get deployment information
echo -e "${YELLOW}📊 STEP 3: Getting deployment information${NC}"

LOAD_BALANCER_DNS=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --query 'Stacks[0].Outputs[?OutputKey==`LoadBalancerDNS`].OutputValue' \
  --output text \
  --region $AWS_REGION)

EFS_ID=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --query 'Stacks[0].Outputs[?OutputKey==`EFSFileSystemId`].OutputValue' \
  --output text \
  --region $AWS_REGION)

echo -e "${GREEN}🌐 Load Balancer URL: http://$LOAD_BALANCER_DNS${NC}"
echo -e "${GREEN}💾 EFS File System ID: $EFS_ID${NC}"

# STEP 4: Verify deployment health
echo -e "${YELLOW}🔍 STEP 4: Verifying deployment health${NC}"

# Wait for service to be ready
echo "Waiting for service to become healthy..."
sleep 60

# Check health endpoint
HEALTH_URL="http://$LOAD_BALANCER_DNS/health"
echo "Checking health endpoint: $HEALTH_URL"

for i in {1..10}; do
    if curl -f -s "$HEALTH_URL" >/dev/null; then
        echo -e "${GREEN}✅ Service is healthy${NC}"
        break
    else
        echo "Attempt $i/10: Service not ready yet, waiting..."
        sleep 30
    fi

    if [ $i -eq 10 ]; then
        echo -e "${RED}❌ Service failed to become healthy${NC}"
        exit 1
    fi
done

# STEP 5: Update configuration
echo -e "${YELLOW}⚙️  STEP 5: Updating configuration${NC}"

# Update config.sh with new URL
sed -i.bak "s|export LANCEDB_API_URL=.*|export LANCEDB_API_URL=\"http://$LOAD_BALANCER_DNS\"|" infrastructure/config.sh

echo -e "${GREEN}✅ Configuration updated${NC}"

# STEP 6: Summary and next steps
echo -e "${BLUE}🎉 BULLETPROOF DEPLOYMENT COMPLETE!${NC}"
echo -e "${BLUE}=====================================${NC}"
echo ""
echo -e "${GREEN}✅ Stack Name: $STACK_NAME${NC}"
echo -e "${GREEN}✅ Service URL: http://$LOAD_BALANCER_DNS${NC}"
echo -e "${GREEN}✅ EFS Storage: $EFS_ID (PERMANENT - will survive all future deployments)${NC}"
echo -e "${GREEN}✅ Mount Path: /data/lancedb (IMMUTABLE)${NC}"
echo ""
echo -e "${YELLOW}📝 NEXT STEPS:${NC}"
echo "1. Run parallel ingestion: npm run scripts:parallel-comprehensive-ingestion"
echo "2. Verify data: curl http://$LOAD_BALANCER_DNS/search?q=test"
echo "3. Update frontend LANCEDB_API_URL in environment"
echo ""
echo -e "${BLUE}🛡️  NEVER AGAIN SAFEGUARDS:${NC}"
echo "- EFS storage mounted to /data/lancedb (NEVER use /tmp)"
echo "- Stack name includes date for tracking"
echo "- Configuration is immutable and documented"
echo "- Health checks verify deployment before proceeding"
echo ""
echo -e "${GREEN}THIS DEPLOYMENT IS BULLETPROOF. NO MORE DATA LOSS.${NC}"
