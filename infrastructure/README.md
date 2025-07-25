# LanceDB Infrastructure Deployment

Complete AWS infrastructure setup for the HH-Bot LanceDB semantic search service.

## 🏗️ Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Internet      │───▶│  Load Balancer  │───▶│   ECS Fargate   │
│   Gateway       │    │      (ALB)      │    │   (2+ Tasks)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │                        │
                              │                        ▼
                              │                ┌─────────────────┐
                              │                │  EFS Storage    │
                              │                │   (Persistent)  │
                              │                └─────────────────┘
                              ▼
                       ┌─────────────────┐
                       │   CloudWatch    │
                       │     Logs        │
                       └─────────────────┘
```

## 📋 Prerequisites

### AWS Resources Required

1. **VPC with Internet Gateway**
2. **Public Subnets** (2+ in different AZs) for Load Balancer
3. **Private Subnets** (2+ in different AZs) for ECS Tasks
4. **OpenAI API Key** stored in AWS Secrets Manager

### Tools Required

- AWS CLI v2+
- Docker
- Bash shell

## 🚀 Quick Start

### Step 1: Prepare OpenAI API Key

Store your OpenAI API key in AWS Secrets Manager:

```bash
aws secretsmanager create-secret \
    --name "openai-api-key" \
    --description "OpenAI API key for LanceDB service" \
    --secret-string '{"OPENAI_API_KEY":"your-actual-api-key-here"}' \
    --region us-east-1
```

Note the ARN from the response - you'll need it for configuration.

### Step 2: Configure Your Environment

```bash
# Copy example configuration
cp config.example.sh config.sh

# Edit with your AWS resource IDs
nano config.sh
```

Update these required values in `config.sh`:
- `VPC_ID`: Your VPC ID
- `PUBLIC_SUBNET_IDS`: Comma-separated public subnet IDs
- `PRIVATE_SUBNET_IDS`: Comma-separated private subnet IDs
- `OPENAI_API_KEY_SECRET_ARN`: Secret Manager ARN from Step 1

### Step 3: Build and Push Container

```bash
# Make scripts executable
chmod +x *.sh

# Load configuration
source config.sh

# Build and push to ECR
./build-and-push.sh
```

This will:
- Create ECR repository if it doesn't exist
- Build the LanceDB Docker image
- Push to ECR
- Output the image URI

### Step 4: Update Configuration with Image URI

After `build-and-push.sh` completes, copy the image URI and update `config.sh`:

```bash
export CONTAINER_IMAGE_URI="123456789012.dkr.ecr.us-east-1.amazonaws.com/lancedb-service:latest"
```

### Step 5: Deploy Infrastructure

```bash
# Load updated configuration
source config.sh

# Deploy EFS + ECS infrastructure
./deploy.sh
```

This will:
- Deploy EFS file system with proper security groups
- Deploy ECS cluster with Fargate service
- Set up Application Load Balancer
- Configure auto-scaling policies
- Output service endpoint

### Step 6: Verify Deployment

```bash
# Check deployment status
./deploy.sh status

# Get service endpoints
./deploy.sh outputs

# Test the service
curl http://your-alb-dns-name/health
```

## 📁 File Structure

```
infrastructure/
├── README.md              # This file
├── config.example.sh      # Example configuration
├── build-and-push.sh      # Container build script
├── deploy.sh              # Infrastructure deployment script
├── efs-storage.yml        # EFS CloudFormation template
└── ecs-cluster.yml        # ECS CloudFormation template
```

## 🛠️ Detailed Configuration

### Required Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| `VPC_ID` | VPC where resources will be deployed | `vpc-1234567890abcdef0` |
| `PUBLIC_SUBNET_IDS` | Public subnets for Load Balancer | `subnet-1234,subnet-5678` |
| `PRIVATE_SUBNET_IDS` | Private subnets for ECS tasks | `subnet-abcd,subnet-efgh` |
| `CONTAINER_IMAGE_URI` | ECR image URI | `123456789012.dkr.ecr.region.amazonaws.com/lancedb-service:latest` |
| `OPENAI_API_KEY_SECRET_ARN` | Secrets Manager ARN | `arn:aws:secretsmanager:region:account:secret:name-suffix` |

### Optional Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `AWS_REGION` | AWS region | `us-east-1` |
| `ENVIRONMENT_NAME` | Environment name prefix | `hh-bot-lancedb` |
| `DESIRED_TASK_COUNT` | Number of ECS tasks | `2` |
| `TASK_CPU` | CPU units per task | `2048` |
| `TASK_MEMORY` | Memory MB per task | `8192` |

## 🔧 Management Commands

### Deployment Commands

```bash
# Deploy infrastructure
./deploy.sh deploy

# Check status
./deploy.sh status

# Show outputs
./deploy.sh outputs

# Delete everything
./deploy.sh delete
```

### Container Commands

```bash
# Build and push with custom tag
./build-and-push.sh --tag v1.0.0

# Build for different region
./build-and-push.sh --region us-west-2

# Keep local images after push
./build-and-push.sh --no-cleanup
```

## 📊 Monitoring & Logs

### CloudWatch Logs

- **ECS Service Logs**: `/ecs/hh-bot-lancedb`
- **EFS Logs**: `/aws/efs/hh-bot-lancedb`

### Health Checks

- **Service Health**: `http://your-alb-dns/health`
- **Readiness Check**: `http://your-alb-dns/ready`

### Auto Scaling

The service automatically scales based on:
- **CPU Utilization**: Target 70%
- **Memory Utilization**: Target 80%
- **Min Capacity**: 2 tasks
- **Max Capacity**: 10 tasks

## 🔐 Security Features

### Network Security

- **ECS tasks** run in private subnets
- **Load balancer** in public subnets
- **Security groups** with minimal required access
- **EFS encryption** at rest and in transit

### IAM Permissions

- **Task Execution Role**: ECR pull, Secrets Manager access
- **Task Role**: EFS read/write, CloudWatch logs
- **Least privilege** principle applied

### Data Protection

- **EFS**: Encrypted with AWS KMS
- **Secrets**: Stored in AWS Secrets Manager
- **Container**: Non-root user execution

## 💰 Cost Optimization

### Resource Sizing

- **Fargate Spot**: 50% of capacity for cost savings
- **EFS**: Provisioned throughput (100 MiB/s)
- **Auto Scaling**: Scales down during low usage

### Cost Monitoring

Monitor costs in AWS Cost Explorer:
- ECS Fargate compute
- EFS storage and throughput
- ALB hours and data processing
- CloudWatch logs storage

## 🔄 Updates & Maintenance

### Update Container Image

```bash
# Build new version
./build-and-push.sh --tag v1.1.0

# Update config with new URI
export CONTAINER_IMAGE_URI="account.dkr.ecr.region.amazonaws.com/lancedb-service:v1.1.0"

# Deploy updated service
./deploy.sh deploy
```

### Update Infrastructure

Modify CloudFormation templates and redeploy:

```bash
./deploy.sh deploy
```

### Backup & Recovery

- **EFS**: Automatic backups enabled
- **Infrastructure**: Version-controlled CloudFormation
- **Container**: Tagged images in ECR

## 🐛 Troubleshooting

### Common Issues

1. **Service Won't Start**
   ```bash
   # Check ECS service events
   aws ecs describe-services --cluster hh-bot-lancedb-cluster --services hh-bot-lancedb-service

   # Check task logs
   aws logs filter-log-events --log-group-name /ecs/hh-bot-lancedb
   ```

2. **Can't Connect to Service**
   ```bash
   # Check ALB target health
   aws elbv2 describe-target-health --target-group-arn $(aws elbv2 describe-target-groups --names hh-bot-lancedb-tg --query 'TargetGroups[0].TargetGroupArn' --output text)
   ```

3. **EFS Mount Issues**
   ```bash
   # Check EFS mount targets
   aws efs describe-mount-targets --file-system-id $(aws cloudformation describe-stacks --stack-name hh-bot-lancedb-efs --query 'Stacks[0].Outputs[?OutputKey==`EFSFileSystemId`].OutputValue' --output text)
   ```

### Getting Help

1. Check CloudFormation events for deployment issues
2. Review ECS service logs in CloudWatch
3. Verify security group configurations
4. Ensure all prerequisites are met

## 🔄 CI/CD Integration

### GitHub Actions Example

```yaml
# .github/workflows/deploy.yml
name: Deploy LanceDB Service

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1

      - name: Build and push container
        working-directory: infrastructure
        run: |
          chmod +x build-and-push.sh
          ./build-and-push.sh --tag ${{ github.sha }}

      - name: Deploy infrastructure
        working-directory: infrastructure
        env:
          CONTAINER_IMAGE_URI: ${{ steps.build.outputs.image-uri }}
        run: |
          chmod +x deploy.sh
          ./deploy.sh deploy
```

## 📚 Additional Resources

- [AWS ECS Best Practices](https://docs.aws.amazon.com/AmazonECS/latest/bestpracticesguide/)
- [AWS EFS Performance](https://docs.aws.amazon.com/efs/latest/ug/performance.html)
- [LanceDB Documentation](https://lancedb.github.io/lancedb/)
- [OpenAI Embeddings API](https://platform.openai.com/docs/guides/embeddings)
