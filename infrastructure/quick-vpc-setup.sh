#!/bin/bash

echo "🚀 Quick VPC Auto-Detection"
echo ""
echo "This will temporarily use admin credentials to auto-detect your VPC."
echo ""

# Backup current credentials
echo "📦 Backing up current credentials..."
cp ~/.aws/credentials ~/.aws/credentials.backup 2>/dev/null || true
cp ~/.aws/config ~/.aws/config.backup 2>/dev/null || true

echo ""
echo "🔑 Switch to admin credentials:"
echo "Run: aws configure"
echo ""
echo "Enter your admin AWS access key & secret key"
echo "(The one you use for AWS Console access)"
echo ""
echo "Then run: ./find-vpc-info.sh"
echo ""
echo "To restore your original credentials afterward:"
echo "cp ~/.aws/credentials.backup ~/.aws/credentials"
echo "cp ~/.aws/config.backup ~/.aws/config"
echo ""
echo "This is just temporary - takes 30 seconds total!"
