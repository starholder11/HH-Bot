#!/bin/bash

# LanceDB Infrastructure Configuration
# Copy this file to config.sh and update with your AWS resource IDs

# AWS Configuration
export AWS_REGION="us-east-1"
export ENVIRONMENT_NAME="hh-bot-lancedb"

# VPC Configuration
# Replace with your actual VPC ID
export VPC_ID="vpc-xxxxxxxxx"

# Subnet Configuration
# Replace with your actual subnet IDs (comma-separated)
export PUBLIC_SUBNET_IDS="subnet-xxxxxxxxx,subnet-yyyyyyyyy"
export PRIVATE_SUBNET_IDS="subnet-aaaaaaaa,subnet-bbbbbbbbb"

# Container Configuration
# This will be set after running build-and-push.sh
export CONTAINER_IMAGE_URI="your-account.dkr.ecr.us-east-1.amazonaws.com/lancedb-service:latest"

# Secrets Configuration
# Replace with your actual Secrets Manager ARN for OpenAI API key
export OPENAI_API_KEY_SECRET_ARN="arn:aws:secretsmanager:us-east-1:account:secret:openai-api-key-xxxxx"

# Optional: ECS Service Configuration
export DESIRED_TASK_COUNT="2"
export TASK_CPU="2048"
export TASK_MEMORY="8192"

# Optional: Domain Configuration (for HTTPS)
export DOMAIN_NAME=""  # e.g., "api.yourdomain.com"

echo "Configuration loaded for environment: $ENVIRONMENT_NAME"
echo "Region: $AWS_REGION"
echo "VPC: $VPC_ID"
