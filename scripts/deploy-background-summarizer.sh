#!/bin/bash
# Deploy background summarizer Lambda function
# Based on existing video processor deployment

set -e

echo "🚀 Deploying background-summarizer Lambda..."

# Change to Lambda directory
cd lambda-background-summarizer

# Install dependencies
echo "📦 Installing dependencies..."
npm ci --only=production

# Package for Lambda
echo "📦 Packaging Lambda function..."
zip -r background-summarizer.zip . -x "*.git*" "*.DS_Store*" "node_modules/.cache/*"

# Check if function exists
FUNCTION_EXISTS=$(aws lambda get-function --function-name background-summarizer --region ${AWS_REGION:-us-east-1} 2>/dev/null && echo "true" || echo "false")

if [ "$FUNCTION_EXISTS" = "true" ]; then
  echo "🔄 Updating existing Lambda function..."
  aws lambda update-function-code \
    --function-name background-summarizer \
    --zip-file fileb://background-summarizer.zip \
    --region ${AWS_REGION:-us-east-1}
else
  echo "🆕 Creating new Lambda function..."
  aws lambda create-function \
    --function-name background-summarizer \
    --runtime nodejs18.x \
    --role arn:aws:iam::${AWS_ACCOUNT_ID}:role/lambda-execution-role \
    --handler index.handler \
    --zip-file fileb://background-summarizer.zip \
    --timeout 30 \
    --memory-size 1024 \
    --region ${AWS_REGION:-us-east-1} \
    --environment Variables='{
      "S3_BUCKET":"'${S3_BUCKET}'",
      "OPENAI_API_KEY":"'${OPENAI_API_KEY}'",
      "AWS_REGION":"'${AWS_REGION:-us-east-1}'"
    }'
fi

# Update environment variables (in case they changed)
echo "🔧 Updating environment variables..."
aws lambda update-function-configuration \
  --function-name background-summarizer \
  --environment Variables='{
    "S3_BUCKET":"'${S3_BUCKET}'",
    "OPENAI_API_KEY":"'${OPENAI_API_KEY}'",
    "AWS_REGION":"'${AWS_REGION:-us-east-1}'"
  }' \
  --region ${AWS_REGION:-us-east-1}

# Clean up
rm background-summarizer.zip

echo "✅ Background summarizer Lambda deployed successfully!"
echo "📝 Function name: background-summarizer"
echo "🌍 Region: ${AWS_REGION:-us-east-1}"
echo ""
echo "Test with:"
echo "aws lambda invoke --function-name background-summarizer --payload '{}' response.json"
