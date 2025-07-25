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
export VPC_ID="vpc-CHANGEME"  # Update with your actual VPC ID

# Subnet Configuration - NEEDS TO BE UPDATED WITH ACTUAL VALUES
# aws ec2 describe-subnets --filters "Name=vpc-id,Values=YOUR_VPC_ID" --query 'Subnets[*].[SubnetId,AvailabilityZone,MapPublicIpOnLaunch]' --output table
export PUBLIC_SUBNET_IDS="subnet-CHANGEME1,subnet-CHANGEME2"   # Update with your public subnet IDs
export PRIVATE_SUBNET_IDS="subnet-CHANGEME3,subnet-CHANGEME4"  # Update with your private subnet IDs

# Container Configuration - Will be set after building
export CONTAINER_IMAGE_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/lancedb-service:latest"

# Secrets Configuration - OpenAI API key for embeddings
# Create with: aws secretsmanager create-secret --name "hh-bot-openai-api-key" --secret-string '{"OPENAI_API_KEY":"your-key-here"}'
export OPENAI_API_KEY_SECRET_ARN="arn:aws:secretsmanager:${AWS_REGION}:${AWS_ACCOUNT_ID}:secret:hh-bot-openai-api-key-CHANGEME"

# ECS Service Configuration
export DESIRED_TASK_COUNT="2"
export TASK_CPU="2048"
export TASK_MEMORY="8192"

# Optional: Domain Configuration
export DOMAIN_NAME=""  # e.g., "lancedb.yourdomain.com"

echo "Configuration loaded for environment: $ENVIRONMENT_NAME"
echo "Region: $AWS_REGION"
echo "Account: $AWS_ACCOUNT_ID"
echo "Bucket: $AWS_S3_BUCKET"
echo ""
echo "⚠️  REQUIRED: Update VPC_ID and SUBNET_IDS with your actual values"
echo "⚠️  REQUIRED: Create OpenAI secret in Secrets Manager"
