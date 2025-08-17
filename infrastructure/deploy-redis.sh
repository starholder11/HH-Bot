#!/bin/bash

# Deploy ElastiCache Redis for Phase 2 Agentic System
set -e

# Load configuration
source "$(dirname "$0")/config.sh"

echo "🚀 Deploying ElastiCache Redis for Phase 2..."
echo "Stack Name: $REDIS_STACK_NAME"
echo "VPC ID: $VPC_ID"
echo "Subnets: $PUBLIC_SUBNET_IDS"
echo "Node Type: $REDIS_NODE_TYPE"
echo ""

# Deploy Redis stack
aws cloudformation deploy \
  --template-file elasticache-redis.yml \
  --stack-name "$REDIS_STACK_NAME" \
  --parameter-overrides \
    EnvironmentName="hh-bot-phase2" \
    VpcId="$VPC_ID" \
    SubnetIds="$PUBLIC_SUBNET_IDS" \
    NodeType="$REDIS_NODE_TYPE" \
  --capabilities CAPABILITY_IAM \
  --region "$AWS_REGION"

echo ""
echo "✅ Redis deployment completed!"

# Get Redis URL
REDIS_URL=$(aws cloudformation describe-stacks \
  --stack-name "$REDIS_STACK_NAME" \
  --query 'Stacks[0].Outputs[?OutputKey==`RedisURL`].OutputValue' \
  --output text \
  --region "$AWS_REGION")

echo ""
echo "🔗 Redis URL: $REDIS_URL"
echo ""
echo "📝 Add this to your environment variables:"
echo "export REDIS_URL=\"$REDIS_URL\""
echo ""
echo "🎯 Phase 2 agentic system is ready to use Redis!"
