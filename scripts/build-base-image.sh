#!/bin/bash
# Build a base image with dependencies pre-installed
# Run this once, then use for fast iteration builds

set -e

echo "🏗️  Building base image with dependencies..."

# Build base image with dependencies
docker build \
  --target base \
  -t hh-bot-base:latest \
  -f Dockerfile.dev \
  .

echo "✅ Base image built: hh-bot-base:latest"
echo "💡 Now use ./scripts/fast-build.sh for rapid iteration"
