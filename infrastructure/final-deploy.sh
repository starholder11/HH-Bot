#!/bin/bash

# Final LanceDB Deployment Script
# Clean, simple, bulletproof deployment

set -e

echo "🚀 Final LanceDB Deployment"
echo "Account: 781939061434"
echo "Region: us-east-1"
echo ""

# Step 1: Build container manually (bypass logging issues)
echo "📦 Building LanceDB container..."

REPO_URI="781939061434.dkr.ecr.us-east-1.amazonaws.com/lancedb-service"

# Login to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 781939061434.dkr.ecr.us-east-1.amazonaws.com

# Build image
echo "Building Docker image..."
docker build -t lancedb-service:latest ../lancedb-service/

# Tag image
docker tag lancedb-service:latest ${REPO_URI}:latest

# Push image
echo "Pushing to ECR..."
docker push ${REPO_URI}:latest

echo "✅ Container ready: ${REPO_URI}:latest"
echo ""

# Step 2: Create final config
echo "⚙️  Creating final configuration..."

cat > final-config.sh << EOF
#!/bin/bash

export AWS_REGION="us-east-1"
export ENVIRONMENT_NAME="hh-bot-lancedb"
export AWS_ACCOUNT_ID="781939061434"
export CONTAINER_IMAGE_URI="${REPO_URI}:latest"

# MANUAL: Update these with your real values
export VPC_ID="vpc-CHANGEME"
export PUBLIC_SUBNET_IDS="subnet-CHANGEME1,subnet-CHANGEME2"
export PRIVATE_SUBNET_IDS="subnet-CHANGEME3,subnet-CHANGEME4"
export OPENAI_API_KEY_SECRET_ARN="arn:aws:secretsmanager:us-east-1:781939061434:secret:hh-bot-openai-api-key-CHANGEME"

export DESIRED_TASK_COUNT="2"
export TASK_CPU="2048"
export TASK_MEMORY="8192"

echo "Final config loaded!"
echo "VPC_ID: \$VPC_ID"
echo "CONTAINER: \$CONTAINER_IMAGE_URI"
EOF

chmod +x final-config.sh

echo "✅ Configuration ready"
echo ""

# Step 3: Show final instructions
echo "🎯 FINAL STEPS (Choose one):"
echo ""
echo "OPTION A - Quick Deploy (if you have admin AWS credentials):"
echo "  1. aws configure  # Enter admin credentials"
echo "  2. ./find-vpc-info.sh  # Auto-detects VPC info"
echo "  3. source final-config.sh && ./deploy.sh"
echo ""
echo "OPTION B - Manual Deploy (5 minutes):"
echo "  1. Edit final-config.sh with your VPC/subnet IDs"
echo "  2. Create OpenAI secret: aws secretsmanager create-secret --name 'hh-bot-openai-api-key' --secret-string '{\"OPENAI_API_KEY\":\"your-key\"}'"
echo "  3. source final-config.sh && ./deploy.sh"
echo ""
echo "🎉 Container is built and ready to deploy!"
echo "Service will be live at: http://your-alb-dns/health"
