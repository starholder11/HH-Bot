#!/bin/bash

# Final LanceDB Configuration
# Container is built and ready!

export AWS_REGION="us-east-1"
export ENVIRONMENT_NAME="hh-bot-lancedb"
export AWS_ACCOUNT_ID="781939061434"
export CONTAINER_IMAGE_URI="781939061434.dkr.ecr.us-east-1.amazonaws.com/lancedb-service:latest"

# MANUAL: Update these with your real values
export VPC_ID="vpc-45bdcd38"
export PUBLIC_SUBNET_IDS="subnet-fc7b5c9a,subnet-d20b60e3"
export PRIVATE_SUBNET_IDS="subnet-a796b7f8,subnet-54a08275"
export OPENAI_API_KEY_SECRET_ARN="arn:aws:secretsmanager:us-east-1:781939061434:secret:hh-bot-openai-api-key"

export DESIRED_TASK_COUNT="2"
export TASK_CPU="2048"
export TASK_MEMORY="8192"

echo "✅ Final config loaded!"
echo "Container: $CONTAINER_IMAGE_URI"
echo "VPC_ID: $VPC_ID"

if [[ "$VPC_ID" == "vpc-CHANGEME" ]]; then
    echo ""
    echo "⚠️  REQUIRED: Update VPC_ID and SUBNET_IDS with your actual values"
    echo "    Run: ./find-vpc-info.sh (with admin creds) OR check AWS Console"
fi

if [[ "$OPENAI_API_KEY_SECRET_ARN" == *"CHANGEME"* ]]; then
    echo ""
    echo "⚠️  REQUIRED: Create OpenAI secret:"
    echo "    aws secretsmanager create-secret --name 'hh-bot-openai-api-key' --secret-string '{\"OPENAI_API_KEY\":\"your-key\"}'"
fi
