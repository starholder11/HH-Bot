#!/bin/bash

# Auto VPC Creator for LanceDB
# Creates a simple VPC with public/private subnets

set -e

echo "🏗️  Creating VPC infrastructure for LanceDB..."
echo ""

# Configuration
VPC_CIDR="10.0.0.0/16"
PUBLIC_SUBNET_1_CIDR="10.0.1.0/24"
PUBLIC_SUBNET_2_CIDR="10.0.2.0/24"
PRIVATE_SUBNET_1_CIDR="10.0.3.0/24"
PRIVATE_SUBNET_2_CIDR="10.0.4.0/24"
REGION="us-east-1"

echo "Creating VPC..."
VPC_ID=$(aws ec2 create-vpc \
    --cidr-block $VPC_CIDR \
    --tag-specifications 'ResourceType=vpc,Tags=[{Key=Name,Value=hh-bot-lancedb-vpc}]' \
    --query 'Vpc.VpcId' \
    --output text)

echo "✅ VPC created: $VPC_ID"

# Enable DNS hostnames
aws ec2 modify-vpc-attribute --vpc-id $VPC_ID --enable-dns-hostnames

echo "Creating Internet Gateway..."
IGW_ID=$(aws ec2 create-internet-gateway \
    --tag-specifications 'ResourceType=internet-gateway,Tags=[{Key=Name,Value=hh-bot-lancedb-igw}]' \
    --query 'InternetGateway.InternetGatewayId' \
    --output text)

echo "✅ Internet Gateway created: $IGW_ID"

# Attach IGW to VPC
aws ec2 attach-internet-gateway --vpc-id $VPC_ID --internet-gateway-id $IGW_ID

echo "Creating subnets..."

# Public Subnet 1 (us-east-1a)
PUBLIC_SUBNET_1=$(aws ec2 create-subnet \
    --vpc-id $VPC_ID \
    --cidr-block $PUBLIC_SUBNET_1_CIDR \
    --availability-zone us-east-1a \
    --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=hh-bot-public-1a}]' \
    --query 'Subnet.SubnetId' \
    --output text)

# Public Subnet 2 (us-east-1b)
PUBLIC_SUBNET_2=$(aws ec2 create-subnet \
    --vpc-id $VPC_ID \
    --cidr-block $PUBLIC_SUBNET_2_CIDR \
    --availability-zone us-east-1b \
    --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=hh-bot-public-1b}]' \
    --query 'Subnet.SubnetId' \
    --output text)

# Private Subnet 1 (us-east-1a)
PRIVATE_SUBNET_1=$(aws ec2 create-subnet \
    --vpc-id $VPC_ID \
    --cidr-block $PRIVATE_SUBNET_1_CIDR \
    --availability-zone us-east-1a \
    --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=hh-bot-private-1a}]' \
    --query 'Subnet.SubnetId' \
    --output text)

# Private Subnet 2 (us-east-1b)
PRIVATE_SUBNET_2=$(aws ec2 create-subnet \
    --vpc-id $VPC_ID \
    --cidr-block $PRIVATE_SUBNET_2_CIDR \
    --availability-zone us-east-1b \
    --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=hh-bot-private-1b}]' \
    --query 'Subnet.SubnetId' \
    --output text)

echo "✅ Subnets created:"
echo "  Public:  $PUBLIC_SUBNET_1, $PUBLIC_SUBNET_2"
echo "  Private: $PRIVATE_SUBNET_1, $PRIVATE_SUBNET_2"

# Enable auto-assign public IP for public subnets
aws ec2 modify-subnet-attribute --subnet-id $PUBLIC_SUBNET_1 --map-public-ip-on-launch
aws ec2 modify-subnet-attribute --subnet-id $PUBLIC_SUBNET_2 --map-public-ip-on-launch

echo "Creating route tables..."

# Create public route table
PUBLIC_RT=$(aws ec2 create-route-table \
    --vpc-id $VPC_ID \
    --tag-specifications 'ResourceType=route-table,Tags=[{Key=Name,Value=hh-bot-public-rt}]' \
    --query 'RouteTable.RouteTableId' \
    --output text)

# Add route to internet gateway
aws ec2 create-route --route-table-id $PUBLIC_RT --destination-cidr-block 0.0.0.0/0 --gateway-id $IGW_ID

# Associate public subnets with public route table
aws ec2 associate-route-table --subnet-id $PUBLIC_SUBNET_1 --route-table-id $PUBLIC_RT
aws ec2 associate-route-table --subnet-id $PUBLIC_SUBNET_2 --route-table-id $PUBLIC_RT

echo "✅ Routing configured"

# Create NAT Gateway for private subnets
echo "Creating NAT Gateway..."

# Allocate Elastic IP
EIP_ALLOC=$(aws ec2 allocate-address --domain vpc --query 'AllocationId' --output text)

# Create NAT Gateway in public subnet
NAT_GW=$(aws ec2 create-nat-gateway \
    --subnet-id $PUBLIC_SUBNET_1 \
    --allocation-id $EIP_ALLOC \
    --tag-specifications 'ResourceType=nat-gateway,Tags=[{Key=Name,Value=hh-bot-nat-gw}]' \
    --query 'NatGateway.NatGatewayId' \
    --output text)

echo "✅ NAT Gateway created: $NAT_GW (waiting for it to be available...)"

# Wait for NAT Gateway to be available
aws ec2 wait nat-gateway-available --nat-gateway-ids $NAT_GW

# Create private route table
PRIVATE_RT=$(aws ec2 create-route-table \
    --vpc-id $VPC_ID \
    --tag-specifications 'ResourceType=route-table,Tags=[{Key=Name,Value=hh-bot-private-rt}]' \
    --query 'RouteTable.RouteTableId' \
    --output text)

# Add route to NAT gateway
aws ec2 create-route --route-table-id $PRIVATE_RT --destination-cidr-block 0.0.0.0/0 --nat-gateway-id $NAT_GW

# Associate private subnets with private route table
aws ec2 associate-route-table --subnet-id $PRIVATE_SUBNET_1 --route-table-id $PRIVATE_RT
aws ec2 associate-route-table --subnet-id $PRIVATE_SUBNET_2 --route-table-id $PRIVATE_RT

echo "✅ Private networking configured"

# Update configuration file
echo ""
echo "🎯 Updating final-config.sh with VPC information..."

sed -i '' "s/vpc-CHANGEME/$VPC_ID/" final-config.sh
sed -i '' "s/subnet-CHANGEME1,subnet-CHANGEME2/$PUBLIC_SUBNET_1,$PUBLIC_SUBNET_2/" final-config.sh
sed -i '' "s/subnet-CHANGEME3,subnet-CHANGEME4/$PRIVATE_SUBNET_1,$PRIVATE_SUBNET_2/" final-config.sh

echo ""
echo "🎉 VPC Infrastructure Complete!"
echo ""
echo "Created:"
echo "  VPC: $VPC_ID"
echo "  Public Subnets: $PUBLIC_SUBNET_1, $PUBLIC_SUBNET_2"
echo "  Private Subnets: $PRIVATE_SUBNET_1, $PRIVATE_SUBNET_2"
echo "  Internet Gateway: $IGW_ID"
echo "  NAT Gateway: $NAT_GW"
echo ""
echo "✅ Configuration updated automatically!"
echo "Next: Create OpenAI secret and deploy!"
