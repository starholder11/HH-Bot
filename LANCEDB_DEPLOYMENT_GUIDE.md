# LanceDB Unified Semantic Layer - Complete Deployment Guide

This document captures the complete implementation process for deploying a LanceDB-based unified semantic layer on AWS ECS Fargate, including all challenges encountered and solutions implemented.

## Overview

**Objective**: Deploy a production-ready LanceDB service on AWS that provides semantic search across multimodal content (text, audio, video, images) for the HH-Bot recursive content generation system.

**Architecture**:
- AWS ECS Fargate cluster
- Application Load Balancer (ALB)
- Docker containerized LanceDB service
- OpenAI embeddings integration
- Next.js frontend with unified search

## Prerequisites

### AWS Setup
- AWS CLI configured with appropriate credentials
- IAM user with sufficient permissions (see IAM section below)
- Docker installed locally
- Node.js/npm environment

### Required Environment Variables
```bash
# For local development
LANCEDB_API_URL=http://your-load-balancer-url
OPENAI_API_KEY=sk-proj-... # Your OpenAI API key
AWS_REGION=us-east-1
AWS_ACCOUNT_ID=your-account-id
```

## Step 1: Infrastructure Setup

### 1.1 Create ECR Repository
```bash
aws ecr create-repository --repository-name lancedb-service --region us-east-1
```

### 1.2 Build and Push Docker Image
```bash
# Navigate to lancedb-service directory
cd lancedb-service

# Build multi-architecture image (CRITICAL: Must be linux/amd64 for Fargate)
docker buildx build --platform linux/amd64 -t lancedb-service:latest .

# Tag for ECR
docker tag lancedb-service:latest YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/lancedb-service:latest

# Login to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com

# Push image
docker push YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/lancedb-service:latest
```

### 1.3 Create OpenAI API Key Secret
```bash
# Create secret in AWS Secrets Manager
aws secretsmanager create-secret \
  --name openai-api-key-plain \
  --description "OpenAI API key for LanceDB service" \
  --secret-string "sk-proj-YOUR_ACTUAL_KEY_HERE" \
  --region us-east-1
```

**Note the returned ARN** - you'll need it for CloudFormation.

## Step 2: CloudFormation Deployment

### 2.1 Find Your VPC and Subnet Information
```bash
# Find default VPC
aws ec2 describe-vpcs --query "Vpcs[?IsDefault==\`true\`].VpcId" --output text

# Find subnets in different AZs
aws ec2 describe-subnets \
  --filters "Name=vpc-id,Values=YOUR_VPC_ID" \
  --query "Subnets[*].[SubnetId,AvailabilityZone]" \
  --output table
```

### 2.2 Deploy Using CloudFormation
Use the `infrastructure/lancedb-minimal.yml` template:

```bash
aws cloudformation deploy \
  --template-file infrastructure/lancedb-minimal.yml \
  --stack-name lancedb-final-v2 \
  --parameter-overrides \
    VpcId=vpc-YOUR_VPC_ID \
    PrivateSubnetId1=subnet-SUBNET_1 \
    PrivateSubnetId2=subnet-SUBNET_2 \
    ECRImageURI=YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/lancedb-service:latest \
    OpenAISecretArn=arn:aws:secretsmanager:us-east-1:YOUR_ACCOUNT_ID:secret:openai-api-key-plain-SUFFIX \
  --capabilities CAPABILITY_IAM \
  --region us-east-1
```

## Step 3: Key Configuration Files

### 3.1 LanceDB Service Structure
```
lancedb-service/
├── Dockerfile                 # Multi-stage build with Node.js
├── package.json              # Dependencies (tsx in production!)
├── index.js                  # Express.js API server
├── lib/
│   ├── logger.js             # Winston logging to /tmp/logs
│   ├── lancedb-manager.js    # Mock LanceDB implementation
│   └── embedding-service.js  # OpenAI integration
└── healthcheck.js           # Docker health check
```

### 3.2 Critical Docker Configuration
```dockerfile
# Dockerfile key points:
- Use NODE_ENV=production
- Install tsx as production dependency (not devDependency)
- Run as non-root user
- Write logs to /tmp/logs (not /var/log)
- Expose port 3000
```

### 3.3 Environment Variables in ECS
```json
{
  "environment": [
    {"name": "NODE_ENV", "value": "production"},
    {"name": "PORT", "value": "3000"},
    {"name": "LANCEDB_PATH", "value": "/tmp/lancedb-data"}
  ],
  "secrets": [
    {
      "name": "OPENAI_API_KEY",
      "valueFrom": "arn:aws:secretsmanager:region:account:secret:openai-api-key-plain-suffix"
    }
  ]
}
```

## Step 4: Common Challenges and Solutions

### 4.1 IAM Permissions Issues

**Problem**: `ResourceInitializationError: unable to retrieve secret ... AccessDeniedException`

**Solution**: Ensure ECS Task Execution Role has the `SecretsManagerReadWrite` managed policy:
```bash
# Option 1: Use AWS Console
# Go to IAM > Roles > Find your task role > Attach policies > SecretsManagerReadWrite

# Option 2: CLI (if you can't find the managed policy)
aws iam put-role-policy \
  --role-name YOUR_TASK_ROLE_NAME \
  --policy-name SecretsManagerAccess \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": [
          "secretsmanager:GetSecretValue"
        ],
        "Resource": "arn:aws:secretsmanager:*:*:secret:openai-api-key*"
      }
    ]
  }'
```

### 4.2 Container Platform Architecture Issues

**Problem**: `CannotPullContainerError – image manifest does not contain descriptor matching platform 'linux/amd64'`

**Solution**: Always build for correct architecture:
```bash
# WRONG: This builds for your local architecture (ARM on Apple Silicon)
docker build -t lancedb-service .

# CORRECT: Explicitly specify platform for Fargate
docker buildx build --platform linux/amd64 -t lancedb-service .
```

### 4.3 npm Dependencies in Production

**Problem**: `npx tsx` fails in container because tsx is in devDependencies

**Solution**: Move tsx to production dependencies:
```bash
cd lancedb-service
npm install tsx@^4.7.0 --save  # Note: --save not --save-dev
```

### 4.4 File Permissions in Container

**Problem**: Container fails to write logs to `/var/log/`

**Solution**: Use user-writable directory:
```javascript
// In logger.js
const logDir = process.env.LOG_DIR || '/tmp/logs';
```

### 4.5 AWS CLI Output Parsing Issues

**Problem**: Shell pipes causing `head: |: No such file or directory`

**Solution**: Use explicit file redirection:
```bash
# WRONG
aws ecs describe-services ... | jq '.field'

# CORRECT
aws ecs describe-services ... > /tmp/output.json
cat /tmp/output.json | jq '.field'

# OR use --output text and --query
aws ecs describe-services --query 'Services[0].serviceName' --output text
```

### 4.6 OpenAI Token Limits

**Problem**: `BadRequestError: 400 This model's maximum context length is 8192 tokens`

**Solution**: Implement text chunking in your ingestion service:
```javascript
// Truncate or chunk large content before embedding
if (combinedText.length > MAX_CHAR_LIMIT) {
  combinedText = combinedText.substring(0, MAX_CHAR_LIMIT);
}
```

### 4.7 Environment Variable Persistence

**Problem**: Next.js not picking up environment variables

**Solution**: Create `.env.local` file or set in shell session:
```bash
# Option 1: Create .env.local (if not blocked by gitignore)
echo "LANCEDB_API_URL=http://your-alb-url" > .env.local
echo "OPENAI_API_KEY=sk-proj-..." >> .env.local

# Option 2: Set in shell session
export LANCEDB_API_URL="http://your-alb-url"
export OPENAI_API_KEY="sk-proj-..."
npm run dev
```

## Step 5: Getting the Load Balancer URL

The Load Balancer URL is critical for connecting your local application to the deployed service:

```bash
# Method 1: From ELB service directly
aws elbv2 describe-load-balancers --region us-east-1 | grep DNSName

# Method 2: From CloudFormation outputs (if available)
aws cloudformation describe-stacks \
  --stack-name lancedb-final-v2 \
  --query "Stacks[0].Outputs[?OutputKey=='LoadBalancerDNSName'].OutputValue" \
  --output text
```

## Step 6: Content Ingestion

### 6.1 Run Ingestion Script
```bash
# Set environment variables (see Step 4.7)
export LANCEDB_API_URL="http://your-load-balancer-dns"
export OPENAI_API_KEY="sk-proj-..."

# Run ingestion
npm run ingest-lancedb
```

### 6.2 Test Search Functionality
```bash
# Test API directly
curl -X POST "http://your-load-balancer-dns/search" \
  -H "Content-Type: application/json" \
  -d '{"query": "music", "limit": 3}'

# Test via Next.js interface
npm run dev
# Visit: http://localhost:3000/unified-search
```

## Step 7: Monitoring and Debugging

### 7.1 Check ECS Service Health
```bash
# Service status
aws ecs describe-services \
  --cluster lancedb-cluster-v2 \
  --services YOUR_SERVICE_NAME

# Task logs
aws logs tail /ecs/lancedb-v2 --follow
```

### 7.2 Debug Container Issues
```bash
# List running tasks
aws ecs list-tasks --cluster lancedb-cluster-v2

# Get task details
aws ecs describe-tasks \
  --cluster lancedb-cluster-v2 \
  --tasks TASK_ARN
```

## Troubleshooting Checklist

When deployment fails, check these items in order:

1. **Image Architecture**: Ensure Docker image is built for `linux/amd64`
2. **IAM Permissions**: Task execution role has SecretsManagerReadWrite
3. **Secret Format**: OpenAI secret is plain text, not JSON
4. **VPC Configuration**: Subnets are in different AZs and have internet access
5. **Resource Names**: CloudFormation resources don't conflict with existing ones
6. **Environment Variables**: All required env vars are set correctly
7. **Health Checks**: Service health endpoint returns 200 OK

## Production Considerations

### Security
- Use IAM roles with minimal required permissions
- Store sensitive data in AWS Secrets Manager
- Enable VPC flow logs for network monitoring

### Scaling
- Configure auto-scaling based on CPU/memory metrics
- Use multiple AZs for high availability
- Consider using EFS for persistent vector storage

### Monitoring
- Set up CloudWatch alarms for service health
- Monitor embedding API rate limits
- Track ingestion success rates

## File Structure Reference

```
infrastructure/
├── lancedb-minimal.yml       # CloudFormation template
├── build-and-push.sh        # Docker build script
└── config.sh               # Environment configuration

lancedb-service/
├── Dockerfile
├── package.json
├── index.js
├── lib/
│   ├── logger.js
│   ├── lancedb-manager.js
│   └── embedding-service.js
└── healthcheck.js

lib/
├── lancedb-ingestion.ts     # Content processing
└── media-storage.ts        # Media asset loading

scripts/
└── ingest-to-lancedb.ts    # One-time ingestion script

app/
├── api/unified-search/     # Next.js API route
└── unified-search/         # Search UI page

components/
└── UnifiedSearch.tsx       # React search component
```

## Success Metrics

A successful deployment should achieve:
- ✅ ECS service running with 1+ healthy tasks
- ✅ Load balancer health checks passing (200 OK on `/health`)
- ✅ Content ingestion completing successfully
- ✅ Search API returning relevant results
- ✅ Next.js unified search UI functional

## Quick Recovery Commands

If you need to quickly redeploy:

```bash
# 1. Get the ALB URL
aws elbv2 describe-load-balancers --region us-east-1 | grep DNSName

# 2. Set environment and test
export LANCEDB_API_URL="http://your-alb-dns"
export OPENAI_API_KEY="sk-proj-..."
curl "$LANCEDB_API_URL/health"

# 3. Run ingestion if needed
npm run ingest-lancedb

# 4. Start local dev server
npm run dev
```

This guide captures all the lessons learned from our implementation. Following these steps should result in a successful deployment without the trial-and-error we experienced initially.
