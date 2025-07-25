#!/bin/bash

# Helper script to find VPC and subnet information for LanceDB deployment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔍 Finding VPC and Subnet Information${NC}"
echo ""

# Try to get VPC info programmatically
echo -e "${YELLOW}Attempting to find VPC information automatically...${NC}"

# Check if we have permissions
if aws ec2 describe-vpcs --query 'Vpcs[0].VpcId' --output text &>/dev/null; then
    echo -e "${GREEN}✅ Have EC2 permissions, getting VPC info...${NC}"

    # Get default VPC
    DEFAULT_VPC=$(aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" --query 'Vpcs[0].VpcId' --output text 2>/dev/null || echo "None")

    if [[ "$DEFAULT_VPC" != "None" && "$DEFAULT_VPC" != "" ]]; then
        echo -e "${GREEN}Default VPC found: ${DEFAULT_VPC}${NC}"

        # Get subnets for this VPC
        echo ""
        echo "Subnets in default VPC:"
        aws ec2 describe-subnets \
            --filters "Name=vpc-id,Values=${DEFAULT_VPC}" \
            --query 'Subnets[*].[SubnetId,AvailabilityZone,MapPublicIpOnLaunch,CidrBlock]' \
            --output table

        # Separate public and private subnets
        PUBLIC_SUBNETS=$(aws ec2 describe-subnets \
            --filters "Name=vpc-id,Values=${DEFAULT_VPC}" "Name=map-public-ip-on-launch,Values=true" \
            --query 'Subnets[*].SubnetId' \
            --output text | tr '\t' ',')

        PRIVATE_SUBNETS=$(aws ec2 describe-subnets \
            --filters "Name=vpc-id,Values=${DEFAULT_VPC}" "Name=map-public-ip-on-launch,Values=false" \
            --query 'Subnets[*].SubnetId' \
            --output text | tr '\t' ',')

        echo ""
        echo -e "${GREEN}📋 Configuration Values:${NC}"
        echo "export VPC_ID=\"${DEFAULT_VPC}\""
        echo "export PUBLIC_SUBNET_IDS=\"${PUBLIC_SUBNETS}\""
        echo "export PRIVATE_SUBNET_IDS=\"${PRIVATE_SUBNETS}\""

        echo ""
        echo -e "${BLUE}💾 Auto-updating config.sh...${NC}"

        # Update config.sh file
        if [[ -f "config.sh" ]]; then
            sed -i.bak "s/export VPC_ID=\"vpc-CHANGEME\"/export VPC_ID=\"${DEFAULT_VPC}\"/" config.sh
            sed -i.bak "s/export PUBLIC_SUBNET_IDS=\"subnet-CHANGEME1,subnet-CHANGEME2\"/export PUBLIC_SUBNET_IDS=\"${PUBLIC_SUBNETS}\"/" config.sh
            sed -i.bak "s/export PRIVATE_SUBNET_IDS=\"subnet-CHANGEME3,subnet-CHANGEME4\"/export PRIVATE_SUBNET_IDS=\"${PRIVATE_SUBNETS}\"/" config.sh

            echo -e "${GREEN}✅ Updated config.sh with VPC and subnet information${NC}"
            rm config.sh.bak
        else
            echo -e "${YELLOW}⚠️  config.sh not found, please update manually${NC}"
        fi

    else
        echo -e "${YELLOW}⚠️  No default VPC found${NC}"
    fi

else
    echo -e "${RED}❌ Insufficient permissions for automatic detection${NC}"
    echo ""
    echo -e "${YELLOW}📝 Manual Instructions:${NC}"
    echo ""
    echo "1. Go to AWS Console → VPC Dashboard"
    echo "2. Find your VPC (likely the default VPC)"
    echo "3. Note the VPC ID (starts with vpc-)"
    echo "4. Go to Subnets section"
    echo "5. Filter by your VPC ID"
    echo "6. Identify public subnets (Auto-assign public IPv4 = Yes)"
    echo "7. Identify private subnets (Auto-assign public IPv4 = No)"
    echo ""
    echo "Then update config.sh with these values:"
    echo "- VPC_ID: Your VPC ID"
    echo "- PUBLIC_SUBNET_IDS: Comma-separated public subnet IDs"
    echo "- PRIVATE_SUBNET_IDS: Comma-separated private subnet IDs"
    echo ""
    echo -e "${BLUE}Alternative: Run this script with admin AWS credentials${NC}"
fi

echo ""
echo -e "${BLUE}🔑 Next: Set up OpenAI API Key Secret${NC}"
echo ""
echo "Run this command with your OpenAI API key:"
echo "aws secretsmanager create-secret \\"
echo "    --name \"hh-bot-openai-api-key\" \\"
echo "    --description \"OpenAI API key for LanceDB semantic search\" \\"
echo "    --secret-string '{\"OPENAI_API_KEY\":\"your-actual-api-key-here\"}' \\"
echo "    --region us-east-1"
echo ""
echo "Then update the secret ARN in config.sh"
