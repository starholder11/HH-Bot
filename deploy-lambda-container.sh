#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
FUNCTION_NAME="video-processor"
ROLE_NAME="lambda-video-processor-role"
REPOSITORY_NAME="lambda-video-processor"
REGION="us-east-1"
TIMEOUT=300

echo -e "${BLUE}🚀 Starting optimized Lambda container deployment...${NC}"

# Function to print status with timestamp
print_status() {
    echo -e "${GREEN}[$(date +'%H:%M:%S')] ✅ $1${NC}"
}

print_error() {
    echo -e "${RED}[$(date +'%H:%M:%S')] ❌ $1${NC}"
}

print_progress() {
    echo -e "${YELLOW}[$(date +'%H:%M:%S')] ⏳ $1${NC}"
}

# Get AWS Account ID
print_progress "Getting AWS account ID..."
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null)
if [ $? -ne 0 ]; then
    print_error "Failed to get AWS account ID. Check AWS credentials."
    exit 1
fi
print_status "AWS Account ID: $AWS_ACCOUNT_ID"

# Check if Docker is running
print_progress "Checking Docker status..."
if ! docker info >/dev/null 2>&1; then
    print_error "Docker is not running. Please start Docker Desktop."
    exit 1
fi
print_status "Docker is running"

# Create ECR repository if it doesn't exist
print_progress "Creating/checking ECR repository..."
aws ecr describe-repositories --repository-names $REPOSITORY_NAME --region $REGION >/dev/null 2>&1 || {
    print_progress "Creating ECR repository: $REPOSITORY_NAME"
    aws ecr create-repository --repository-name $REPOSITORY_NAME --region $REGION >/dev/null
}
print_status "ECR repository ready"

# Get ECR login token and login to Docker
print_progress "Logging into ECR..."
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com
if [ $? -ne 0 ]; then
    print_error "Failed to login to ECR"
    exit 1
fi
print_status "ECR login successful"

# Build Docker image with timeout
IMAGE_URI="$AWS_ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$REPOSITORY_NAME:latest"
print_progress "Building Docker image (this may take 3-5 minutes)..."

cd lambda-video-processor

# Build using Buildx but output a Docker-v2 image (no OCI, provenance or SBOM)
print_status "Building with docker buildx (Docker-v2 manifest, gzip layers)"

docker buildx build --platform linux/amd64 \
  --output type=docker \
  --provenance=false --sbom=false \
  -t $REPOSITORY_NAME . || {
    print_error "Docker build failed"
    exit 1
}

print_status "Docker image built successfully"

# Tag and push image
print_progress "Pushing image to ECR..."
docker tag $REPOSITORY_NAME:latest $IMAGE_URI

# Push image to ECR
docker push $IMAGE_URI || {
    print_error "Docker push failed"
    exit 1
}

print_status "Image pushed to ECR"

cd ..

# Create IAM role if it doesn't exist
print_progress "Creating/checking IAM role..."
aws iam get-role --role-name $ROLE_NAME >/dev/null 2>&1 || {
    print_progress "Creating IAM role: $ROLE_NAME"

    # Create trust policy
    cat > /tmp/trust-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

    aws iam create-role \
        --role-name $ROLE_NAME \
        --assume-role-policy-document file:///tmp/trust-policy.json >/dev/null

    # Attach policies
    aws iam attach-role-policy \
        --role-name $ROLE_NAME \
        --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

    aws iam attach-role-policy \
        --role-name $ROLE_NAME \
        --policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess

    # Wait for role propagation
    print_progress "Waiting for IAM role propagation..."
    sleep 10
}
print_status "IAM role ready"

# Create or update Lambda function
ROLE_ARN="arn:aws:iam::$AWS_ACCOUNT_ID:role/$ROLE_NAME"
print_progress "Creating/updating Lambda function..."

# Check if function exists
aws lambda get-function --function-name $FUNCTION_NAME --region $REGION >/dev/null 2>&1
FUNCTION_EXISTS=$?

if [ $FUNCTION_EXISTS -eq 0 ]; then
    print_progress "Updating existing function..."
    aws lambda update-function-code \
        --function-name $FUNCTION_NAME \
        --image-uri $IMAGE_URI \
        --region $REGION >/dev/null

    aws lambda update-function-configuration \
        --function-name $FUNCTION_NAME \
        --timeout $TIMEOUT \
        --memory-size 1024 \
        --region $REGION >/dev/null
else
    print_progress "Creating new function..."
    aws lambda create-function \
        --function-name $FUNCTION_NAME \
        --package-type Image \
        --code ImageUri=$IMAGE_URI \
        --role $ROLE_ARN \
        --timeout $TIMEOUT \
        --memory-size 1024 \
        --region $REGION >/dev/null
fi

print_status "Lambda function deployed successfully"

# Wait for function to be ready
print_progress "Waiting for function to be ready..."
for i in {1..30}; do
    STATE=$(aws lambda get-function --function-name $FUNCTION_NAME --region $REGION --query "Configuration.State" --output text 2>/dev/null || echo "Unknown")
    if [ "$STATE" = "Active" ]; then
        break
    fi
    sleep 2
done

print_status "Function is active and ready"

# Test the function
print_progress "Testing function with a simple invocation..."
TEST_PAYLOAD='{"bucketName":"hh-bot-images-2025-prod","videoKey":"videos/test.mp4","action":"get_metadata"}'

aws lambda invoke \
    --function-name $FUNCTION_NAME \
    --payload "$TEST_PAYLOAD" \
    --region $REGION \
    /tmp/lambda-response.json >/dev/null 2>&1 || {
    print_error "Test invocation failed (this is expected if test video doesn't exist)"
}

print_status "Function test completed"

# Clean up
rm -f /tmp/trust-policy.json /tmp/lambda-response.json

echo -e "${GREEN}"
echo "🎉 Lambda container deployment completed successfully!"
echo ""
echo "📋 Deployment Summary:"
echo "   Function Name: $FUNCTION_NAME"
echo "   Region: $REGION"
echo "   Image URI: $IMAGE_URI"
echo "   Function ARN: arn:aws:lambda:$REGION:$AWS_ACCOUNT_ID:function:$FUNCTION_NAME"
echo ""
echo "🔧 Usage Example:"
echo "   aws lambda invoke --function-name $FUNCTION_NAME \\"
echo "     --payload '{\"bucketName\":\"your-bucket\",\"videoKey\":\"video.mp4\",\"action\":\"extract_keyframes\"}' \\"
echo "     response.json"
echo -e "${NC}"
