#!/bin/bash
# One-click deployment with admin credentials

set -e

echo "🚀 One-Click LanceDB Deployment"
echo ""

# Auto-detect VPC
./find-vpc-info.sh

# Load configuration
source config.sh

# Build and push if not done
if [ ! "$(docker images -q lancedb-service:latest 2> /dev/null)" ]; then
    echo "Building container..."
    ./build-and-push.sh
fi

# Deploy infrastructure
echo "Deploying infrastructure..."
./deploy.sh

echo ""
echo "🎉 Deployment complete!"
echo "Service will be available at the ALB DNS name shown above."
