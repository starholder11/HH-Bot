#!/bin/bash

# LanceDB Infrastructure Configuration
# Using existing HH-Bot AWS infrastructure

# AWS Configuration
export AWS_REGION="us-east-1"
export ENVIRONMENT_NAME="hh-bot-lancedb"

# Using existing AWS account and bucket
export AWS_ACCOUNT_ID="781939061434"
export AWS_S3_BUCKET="hh-bot-images-2025-prod"

# VPC Configuration - NEEDS TO BE UPDATED WITH ACTUAL VALUES
# The video-processor Lambda likely runs in the default VPC
# You can find these in AWS Console -> VPC or by running with admin credentials:
# aws ec2 describe-vpcs --query 'Vpcs[?IsDefault==`true`].VpcId' --output text
export VPC_ID="vpc-45bdcd38"  # Update with your actual VPC ID

# Subnet Configuration - NEEDS TO BE UPDATED WITH ACTUAL VALUES
# aws ec2 describe-subnets --filters "Name=vpc-id,Values=YOUR_VPC_ID" --query 'Subnets[*].[SubnetId,AvailabilityZone,MapPublicIpOnLaunch]' --output table
export PUBLIC_SUBNET_IDS="subnet-fc7b5c9a,subnet-d20b60e3,subnet-a796b7f8,subnet-54a08275,subnet-7ef20532,subnet-f14f56ff"   # Update with your public subnet IDs
export PRIVATE_SUBNET_IDS=""  # Update with your private subnet IDs

# Container Configuration - Will be set after building
export CONTAINER_IMAGE_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/lancedb-service:latest"

# Production LanceDB API URL
export LANCEDB_API_URL="http://lancedb-bulletproof-simple-alb-705151448.us-east-1.elb.amazonaws.com"

# Secrets Configuration - OpenAI API key for embeddings
# Create with: aws secretsmanager create-secret --name "hh-bot-openai-api-key" --secret-string '{"OPENAI_API_KEY":"your-key-here"}'
export OPENAI_API_KEY_SECRET_ARN="arn:aws:secretsmanager:us-east-1:781939061434:secret:openai-api-key-plain-ObIbHG"

# ECS Service Configuration
export DESIRED_TASK_COUNT="2"
export TASK_CPU="2048"
export TASK_MEMORY="8192"

# Redis Configuration for Phase 2 Agentic System
export REDIS_STACK_NAME="hh-bot-phase2-redis-v2"
export REDIS_NODE_TYPE="cache.t3.micro"
export REDIS_URL="redis://hh-bot-phase2-redis.5eblzz.ng.0001.use1.cache.amazonaws.com:6379"

# Optional: Domain Configuration
export DOMAIN_NAME=""  # e.g., "lancedb.yourdomain.com"

echo "Configuration loaded for environment: $ENVIRONMENT_NAME"
echo "Region: $AWS_REGION"
echo "Account: $AWS_ACCOUNT_ID"
echo "Bucket: $AWS_S3_BUCKET"
echo ""
echo "⚠️  REQUIRED: Update VPC_ID and SUBNET_IDS with your actual values"
echo "⚠️  REQUIRED: Create OpenAI secret in Secrets Manager"
echo "⚠️  REQUIRED: Deploy ElastiCache Redis for Phase 2 agentic system"
