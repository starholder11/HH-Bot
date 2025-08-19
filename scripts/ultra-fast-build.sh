#!/bin/bash
# ULTRA-FAST build using Docker cache mounts
# Should take 1-3 minutes after first build

set -e

GIT_SHA=$(git rev-parse --short HEAD)
echo "⚡ Ultra-fast building with SHA: $GIT_SHA"

# Enable BuildKit for cache mounts
export DOCKER_BUILDKIT=1

# Build with aggressive caching
docker build \
  --build-arg GIT_SHA=$GIT_SHA \
  --build-arg REDIS_URL="$REDIS_URL" \
  -t hh-bot:$GIT_SHA \
  -t hh-bot:latest \
  -f Dockerfile.cache \
  .

echo "⚡ Ultra-fast build complete: hh-bot:$GIT_SHA"
echo "⏱️  Subsequent builds should take 1-3 minutes"

if [ "$1" = "--push" ]; then
    echo "🚢 Pushing to ECR..."
    ./scripts/push-to-ecr.sh $GIT_SHA
fi
