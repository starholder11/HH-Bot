#!/bin/bash

# Smart Configuration for LanceDB Deployment
# Using intelligent defaults for us-east-1

export AWS_REGION="us-east-1"
export ENVIRONMENT_NAME="hh-bot-lancedb"
export AWS_ACCOUNT_ID="781939061434"
export AWS_S3_BUCKET="hh-bot-images-2025-prod"

# Common default VPC patterns for us-east-1
# These are educated guesses - the script will validate them
export VPC_ID="vpc-12345678"  # Placeholder - will be auto-detected
export PUBLIC_SUBNET_IDS="subnet-12345678,subnet-87654321"  # Will be auto-detected
export PRIVATE_SUBNET_IDS="subnet-abcdef12,subnet-21fedcba"  # Will be auto-detected

# Container image (will be set after build)
export CONTAINER_IMAGE_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/lancedb-service:latest"

# OpenAI secret (placeholder)
export OPENAI_API_KEY_SECRET_ARN="arn:aws:secretsmanager:${AWS_REGION}:${AWS_ACCOUNT_ID}:secret:hh-bot-openai-api-key-abcdef"

# Service configuration
export DESIRED_TASK_COUNT="2"
export TASK_CPU="2048"
export TASK_MEMORY="8192"

echo "Smart configuration loaded!"
