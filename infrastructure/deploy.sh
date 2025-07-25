#!/bin/bash

# LanceDB Infrastructure Deployment Script
# This script deploys EFS storage and ECS cluster for the LanceDB service

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT_NAME="hh-bot-lancedb"
AWS_REGION="us-east-1"
STACK_PREFIX="${ENVIRONMENT_NAME}"
EFS_STACK_NAME="${STACK_PREFIX}-efs-v3"
ECS_STACK_NAME="${STACK_PREFIX}-ecs-v2"

# Required parameters (these should be set before running)
VPC_ID="${VPC_ID:-}"
PUBLIC_SUBNET_IDS="${PUBLIC_SUBNET_IDS:-}"
PRIVATE_SUBNET_IDS="${PRIVATE_SUBNET_IDS:-}"
CONTAINER_IMAGE_URI="${CONTAINER_IMAGE_URI:-}"
OPENAI_API_KEY_SECRET_ARN="${OPENAI_API_KEY_SECRET_ARN:-}"

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI is not installed or not in PATH"
        exit 1
    fi

    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        log_error "AWS credentials not configured or invalid"
        exit 1
    fi

    # Check required parameters
    if [[ -z "$VPC_ID" ]]; then
        log_error "VPC_ID is not set. Please set it in this script or export it as environment variable."
        exit 1
    fi

    if [[ -z "$PUBLIC_SUBNET_IDS" ]]; then
        log_error "PUBLIC_SUBNET_IDS is not set. Please set it in this script or export it as environment variable."
        exit 1
    fi

    if [[ -z "$PRIVATE_SUBNET_IDS" ]]; then
        log_error "PRIVATE_SUBNET_IDS is not set. Please set it in this script or export it as environment variable."
        exit 1
    fi

    if [[ -z "$CONTAINER_IMAGE_URI" ]]; then
        log_error "CONTAINER_IMAGE_URI is not set. Please set it in this script or export it as environment variable."
        exit 1
    fi

    if [[ -z "$OPENAI_API_KEY_SECRET_ARN" ]]; then
        log_error "OPENAI_API_KEY_SECRET_ARN is not set. Please set it in this script or export it as environment variable."
        exit 1
    fi

    log_success "Prerequisites check passed"
}

wait_for_stack() {
    local stack_name=$1
    local operation=$2

    log_info "Waiting for stack $stack_name to complete $operation..."

    local start_time=$(date +%s)
    local timeout=1800  # 30 minutes

    while true; do
        local current_time=$(date +%s)
        local elapsed=$((current_time - start_time))

        if [[ $elapsed -gt $timeout ]]; then
            log_error "Timeout waiting for stack $stack_name"
            return 1
        fi

        local stack_status=$(aws cloudformation describe-stacks \
            --stack-name "$stack_name" \
            --region "$AWS_REGION" \
            --query 'Stacks[0].StackStatus' \
            --output text 2>/dev/null || echo "STACK_NOT_FOUND")

        case $stack_status in
            CREATE_COMPLETE|UPDATE_COMPLETE)
                log_success "Stack $stack_name $operation completed successfully"
                return 0
                ;;
            CREATE_FAILED|UPDATE_FAILED|ROLLBACK_COMPLETE|UPDATE_ROLLBACK_COMPLETE)
                log_error "Stack $stack_name $operation failed with status: $stack_status"
                return 1
                ;;
            CREATE_IN_PROGRESS|UPDATE_IN_PROGRESS|UPDATE_ROLLBACK_IN_PROGRESS)
                echo -n "."
                sleep 30
                ;;
            STACK_NOT_FOUND)
                if [[ "$operation" == "deletion" ]]; then
                    log_success "Stack $stack_name has been deleted"
                    return 0
                else
                    log_error "Stack $stack_name not found"
                    return 1
                fi
                ;;
            *)
                log_warning "Unknown stack status: $stack_status"
                sleep 30
                ;;
        esac
    done
}

deploy_efs_stack() {
    log_info "Deploying EFS storage stack..."

    # Check if stack exists
    local stack_exists=$(aws cloudformation describe-stacks \
        --stack-name "$EFS_STACK_NAME" \
        --region "$AWS_REGION" \
        --query 'Stacks[0].StackName' \
        --output text 2>/dev/null || echo "STACK_NOT_FOUND")

    local operation="deploy"
    log_info "Deploying stack (create or update)..."

    aws cloudformation deploy \
        --stack-name "$EFS_STACK_NAME" \
        --template-file efs-minimal.yml \
        --parameter-overrides \
            VpcId="$VPC_ID" \
            SubnetIds="$PRIVATE_SUBNET_IDS" \
            EnvironmentName="$ENVIRONMENT_NAME" \
        --capabilities CAPABILITY_NAMED_IAM \
        --region "$AWS_REGION" \
        --tags \
            Environment="$ENVIRONMENT_NAME" \
            Project="HH-Bot-LanceDB" \
            ManagedBy="CloudFormation"

    wait_for_stack "$EFS_STACK_NAME" "$operation"
}

deploy_ecs_stack() {
    log_info "Deploying ECS cluster stack..."

    # Check if stack exists
    local stack_exists=$(aws cloudformation describe-stacks \
        --stack-name "$ECS_STACK_NAME" \
        --region "$AWS_REGION" \
        --query 'Stacks[0].StackName' \
        --output text 2>/dev/null || echo "STACK_NOT_FOUND")

    local operation="deploy"
    log_info "Deploying stack (create or update)..."

    aws cloudformation deploy \
        --stack-name "$ECS_STACK_NAME" \
        --template-file ecs-simple.yml \
        --parameter-overrides \
            VpcId="$VPC_ID" \
            PublicSubnetIds="$PUBLIC_SUBNET_IDS" \
            PrivateSubnetIds="$PRIVATE_SUBNET_IDS" \
            EnvironmentName="$ENVIRONMENT_NAME" \
            ContainerImage="$CONTAINER_IMAGE_URI" \
            OpenAIApiKeySecret="$OPENAI_API_KEY_SECRET_ARN" \
        --capabilities CAPABILITY_NAMED_IAM \
        --region "$AWS_REGION" \
        --tags \
            Environment="$ENVIRONMENT_NAME" \
            Project="HH-Bot-LanceDB" \
            ManagedBy="CloudFormation"

    wait_for_stack "$ECS_STACK_NAME" "$operation"
}

get_stack_outputs() {
    log_info "Getting stack outputs..."

    echo ""
    echo "=== EFS Stack Outputs ==="
    aws cloudformation describe-stacks \
        --stack-name "$EFS_STACK_NAME" \
        --region "$AWS_REGION" \
        --query 'Stacks[0].Outputs[*].[OutputKey,OutputValue]' \
        --output table

    echo ""
    echo "=== ECS Stack Outputs ==="
    aws cloudformation describe-stacks \
        --stack-name "$ECS_STACK_NAME" \
        --region "$AWS_REGION" \
        --query 'Stacks[0].Outputs[*].[OutputKey,OutputValue]' \
        --output table

    # Get the service endpoint
    local service_endpoint=$(aws cloudformation describe-stacks \
        --stack-name "$ECS_STACK_NAME" \
        --region "$AWS_REGION" \
        --query 'Stacks[0].Outputs[?OutputKey==`ServiceEndpoint`].OutputValue' \
        --output text)

    echo ""
    log_success "Deployment completed successfully!"
    log_info "Service endpoint: $service_endpoint"
    log_info "Health check: $service_endpoint/health"
    log_info "API documentation: $service_endpoint (see README.md)"
}

delete_stacks() {
    log_warning "Deleting infrastructure stacks..."
    read -p "Are you sure you want to delete all infrastructure? (y/N): " -n 1 -r
    echo

    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Deletion cancelled"
        return 0
    fi

    # Delete ECS stack first (dependent on EFS)
    log_info "Deleting ECS stack..."
    aws cloudformation delete-stack \
        --stack-name "$ECS_STACK_NAME" \
        --region "$AWS_REGION" || true

    wait_for_stack "$ECS_STACK_NAME" "deletion"

    # Delete EFS stack
    log_info "Deleting EFS stack..."
    aws cloudformation delete-stack \
        --stack-name "$EFS_STACK_NAME" \
        --region "$AWS_REGION" || true

    wait_for_stack "$EFS_STACK_NAME" "deletion"

    log_success "All stacks deleted successfully"
}

show_help() {
    echo "LanceDB Infrastructure Deployment Script"
    echo ""
    echo "Usage: $0 [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  deploy    Deploy both EFS and ECS stacks (default)"
    echo "  delete    Delete all infrastructure stacks"
    echo "  status    Show current stack status"
    echo "  outputs   Show stack outputs"
    echo "  help      Show this help message"
    echo ""
    echo "Required Environment Variables:"
    echo "  VPC_ID                     - VPC ID for deployment"
    echo "  PUBLIC_SUBNET_IDS          - Comma-separated public subnet IDs"
    echo "  PRIVATE_SUBNET_IDS         - Comma-separated private subnet IDs"
    echo "  CONTAINER_IMAGE_URI        - ECR URI for LanceDB container"
    echo "  OPENAI_API_KEY_SECRET_ARN  - Secrets Manager ARN for OpenAI API key"
    echo ""
    echo "Optional Environment Variables:"
    echo "  AWS_REGION                 - AWS region (default: us-east-1)"
    echo "  ENVIRONMENT_NAME           - Environment name (default: hh-bot-lancedb)"
}

show_status() {
    log_info "Checking stack status..."

    echo ""
    echo "=== EFS Stack Status ==="
    aws cloudformation describe-stacks \
        --stack-name "$EFS_STACK_NAME" \
        --region "$AWS_REGION" \
        --query 'Stacks[0].[StackName,StackStatus,CreationTime]' \
        --output table 2>/dev/null || echo "Stack not found"

    echo ""
    echo "=== ECS Stack Status ==="
    aws cloudformation describe-stacks \
        --stack-name "$ECS_STACK_NAME" \
        --region "$AWS_REGION" \
        --query 'Stacks[0].[StackName,StackStatus,CreationTime]' \
        --output table 2>/dev/null || echo "Stack not found"
}

main() {
    local command=${1:-deploy}

    case $command in
        deploy)
            check_prerequisites
            echo "[INFO] Skipping EFS for now - deploying ECS only"
            deploy_ecs_stack
            get_stack_outputs
            ;;
        delete)
            delete_stacks
            ;;
        status)
            show_status
            ;;
        outputs)
            get_stack_outputs
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            log_error "Unknown command: $command"
            echo ""
            show_help
            exit 1
            ;;
    esac
}

# Script execution
main "$@"
