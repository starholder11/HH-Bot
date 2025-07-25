#!/bin/bash

# LanceDB Container Build and Push Script
# This script builds the Docker image and pushes it to Amazon ECR

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
AWS_REGION="us-east-1"
ECR_REPOSITORY_NAME="lancedb-service"
IMAGE_TAG="latest"
DOCKERFILE_PATH="../lancedb-service"

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

    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed or not in PATH"
        exit 1
    fi

    # Check Docker daemon
    if ! docker info &> /dev/null; then
        log_error "Docker daemon is not running"
        exit 1
    fi

    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        log_error "AWS credentials not configured or invalid"
        exit 1
    fi

    # Check if Dockerfile exists
    if [[ ! -f "$DOCKERFILE_PATH/Dockerfile" ]]; then
        log_error "Dockerfile not found at $DOCKERFILE_PATH/Dockerfile"
        exit 1
    fi

    log_success "Prerequisites check passed"
}

get_aws_account_id() {
    aws sts get-caller-identity --query Account --output text
}

create_ecr_repository() {
    local account_id=$(get_aws_account_id)
    local repository_uri="${account_id}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPOSITORY_NAME}"

    log_info "Checking if ECR repository exists..."

    # Check if repository exists
    if aws ecr describe-repositories \
        --repository-names "$ECR_REPOSITORY_NAME" \
        --region "$AWS_REGION" &> /dev/null; then
        log_info "ECR repository already exists: $ECR_REPOSITORY_NAME"
    else
        log_info "Creating ECR repository: $ECR_REPOSITORY_NAME"
        aws ecr create-repository \
            --repository-name "$ECR_REPOSITORY_NAME" \
            --region "$AWS_REGION" \
            --image-scanning-configuration scanOnPush=true \
            --encryption-configuration encryptionType=AES256 \
            --tags Key=Project,Value=HH-Bot-LanceDB Key=ManagedBy,Value=Script

        log_success "ECR repository created successfully"
    fi

    echo "$repository_uri"
}

login_to_ecr() {
    log_info "Logging into Amazon ECR..."

    aws ecr get-login-password --region "$AWS_REGION" | \
        docker login --username AWS --password-stdin \
        "$(get_aws_account_id).dkr.ecr.${AWS_REGION}.amazonaws.com"

    log_success "Successfully logged into ECR"
}

build_docker_image() {
    local repository_uri=$1

    log_info "Building Docker image..."
    log_info "Build context: $DOCKERFILE_PATH"
    log_info "Target image: $repository_uri:$IMAGE_TAG"

    # Build the image
    docker build \
        -t "$ECR_REPOSITORY_NAME:$IMAGE_TAG" \
        -t "$repository_uri:$IMAGE_TAG" \
        "$DOCKERFILE_PATH"

    log_success "Docker image built successfully"
}

push_docker_image() {
    local repository_uri=$1

    log_info "Pushing Docker image to ECR..."

    docker push "$repository_uri:$IMAGE_TAG"

    log_success "Docker image pushed successfully"
    log_info "Image URI: $repository_uri:$IMAGE_TAG"
}

scan_image() {
    local repository_uri=$1

    log_info "Starting image scan..."

    aws ecr start-image-scan \
        --repository-name "$ECR_REPOSITORY_NAME" \
        --image-id imageTag="$IMAGE_TAG" \
        --region "$AWS_REGION" || true

    log_info "Image scan initiated (results will be available shortly)"
}

cleanup_local_images() {
    log_info "Cleaning up local images..."

    # Remove local images to free up space
    docker rmi "$ECR_REPOSITORY_NAME:$IMAGE_TAG" 2>/dev/null || true

    # Clean up dangling images
    docker image prune -f &> /dev/null || true

    log_success "Local cleanup completed"
}

show_image_info() {
    local repository_uri=$1

    log_info "Getting image information..."

    # Get image details
    aws ecr describe-images \
        --repository-name "$ECR_REPOSITORY_NAME" \
        --image-ids imageTag="$IMAGE_TAG" \
        --region "$AWS_REGION" \
        --query 'imageDetails[0].[imageSizeInBytes,imagePushedAt]' \
        --output table

    echo ""
    log_success "Image build and push completed successfully!"
    echo ""
    echo "Image URI: $repository_uri:$IMAGE_TAG"
    echo ""
    echo "Next steps:"
    echo "1. Set CONTAINER_IMAGE_URI environment variable:"
    echo "   export CONTAINER_IMAGE_URI=\"$repository_uri:$IMAGE_TAG\""
    echo ""
    echo "2. Deploy infrastructure:"
    echo "   ./deploy.sh"
}

show_help() {
    echo "LanceDB Container Build and Push Script"
    echo ""
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --region REGION       AWS region (default: us-east-1)"
    echo "  --repository NAME     ECR repository name (default: lancedb-service)"
    echo "  --tag TAG            Image tag (default: latest)"
    echo "  --dockerfile-path PATH Path to Dockerfile directory (default: ../lancedb-service)"
    echo "  --no-cleanup         Don't clean up local images after push"
    echo "  --help               Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                                    # Build and push with defaults"
    echo "  $0 --region us-west-2 --tag v1.0.0   # Custom region and tag"
    echo "  $0 --no-cleanup                      # Keep local images"
}

main() {
    local cleanup=true

    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --region)
                AWS_REGION="$2"
                shift 2
                ;;
            --repository)
                ECR_REPOSITORY_NAME="$2"
                shift 2
                ;;
            --tag)
                IMAGE_TAG="$2"
                shift 2
                ;;
            --dockerfile-path)
                DOCKERFILE_PATH="$2"
                shift 2
                ;;
            --no-cleanup)
                cleanup=false
                shift
                ;;
            --help)
                show_help
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done

    check_prerequisites

    local repository_uri=$(create_ecr_repository)

    login_to_ecr
    build_docker_image "$repository_uri"
    push_docker_image "$repository_uri"
    scan_image "$repository_uri"

    if [[ "$cleanup" == true ]]; then
        cleanup_local_images
    fi

    show_image_info "$repository_uri"
}

# Script execution
main "$@"
