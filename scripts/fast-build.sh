#!/bin/bash
# Fast Docker build using cached base image
# Should take 2-5 minutes instead of 45 minutes

set -e

# Get git SHA for build fingerprinting
GIT_SHA=$(git rev-parse --short HEAD)
echo "🚀 Fast building with SHA: $GIT_SHA"

# Check if base image exists
if ! docker image inspect hh-bot-base:latest >/dev/null 2>&1; then
    echo "❌ Base image not found. Run ./scripts/build-base-image.sh first"
    exit 1
fi

# Fast build using cached base
docker build \
  --build-arg GIT_SHA=$GIT_SHA \
  --build-arg REDIS_URL="$REDIS_URL" \
  -t hh-bot:$GIT_SHA \
  -t hh-bot:latest \
  -f Dockerfile.dev \
  .

echo "✅ Fast build complete: hh-bot:$GIT_SHA"
echo "⏱️  Build time should be under 5 minutes"

# Optional: Push to ECR
if [ "$1" = "--push" ]; then
    echo "🚢 Pushing to ECR..."
    ./scripts/push-to-ecr.sh $GIT_SHA
fi
