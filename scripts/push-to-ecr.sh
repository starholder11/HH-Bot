#!/bin/bash
# Push Docker image to ECR and update ECS service

set -e

GIT_SHA=${1:-$(git rev-parse --short HEAD)}
ECR_REPO="781939061434.dkr.ecr.us-east-1.amazonaws.com/hh-agent-app"

echo "🚢 Pushing hh-bot:$GIT_SHA to ECR..."

# Login to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin $ECR_REPO

# Tag and push
docker tag hh-bot:$GIT_SHA $ECR_REPO:$GIT_SHA
docker tag hh-bot:$GIT_SHA $ECR_REPO:latest

docker push $ECR_REPO:$GIT_SHA
docker push $ECR_REPO:latest

echo "✅ Pushed to ECR: $ECR_REPO:$GIT_SHA"

# Update ECS task definition
echo "🔄 Updating ECS task definition..."

# Get current task definition and update image
aws ecs describe-task-definition --task-definition hh-agent-app-task-v2 --query 'taskDefinition' --output json > /tmp/current-task-def.json

# Update image URI and build SHA in task definition
cat /tmp/current-task-def.json | \
  jq --arg image "$ECR_REPO:$GIT_SHA" '.containerDefinitions[0].image = $image' | \
  jq --arg sha "$GIT_SHA" '(.containerDefinitions[0].environment[] | select(.name == "APP_BUILD_SHA") | .value) = $sha' | \
  jq 'del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .placementConstraints, .compatibilities, .registeredAt, .registeredBy)' > /tmp/updated-task-def.json

# Register new task definition
NEW_REVISION=$(aws ecs register-task-definition --cli-input-json file:///tmp/updated-task-def.json --query 'taskDefinition.revision' --output text)

echo "📋 Registered task definition revision: $NEW_REVISION"

# Update service
aws ecs update-service \
  --cluster lancedb-bulletproof-simple-cluster \
  --service hh-agent-app-service-v2 \
  --task-definition hh-agent-app-task-v2:$NEW_REVISION \
  --query 'service.serviceName' --output text

echo "✅ ECS service updated with new image: $GIT_SHA"
echo "🎯 Deployment complete!"
