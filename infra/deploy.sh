#!/usr/bin/env bash
set -euo pipefail

# S3 Static Site Deploy Script
# Usage: ./infra/deploy.sh <bucket-name> [--profile <aws-profile>]
#
# Prerequisites:
#   - AWS CLI configured
#   - S3 bucket created with static website hosting enabled

BUCKET="${1:?Usage: deploy.sh <bucket-name> [--profile <aws-profile>]}"
PROFILE_ARG=""
if [[ "${2:-}" == "--profile" ]]; then
  PROFILE_ARG="--profile ${3:?Missing profile name}"
fi

echo "Building site..."
npm run build

echo "Deploying to s3://$BUCKET..."
aws s3 sync dist/ "s3://$BUCKET" \
  --delete \
  --cache-control "public, max-age=3600" \
  $PROFILE_ARG

# Set longer cache for immutable assets
aws s3 sync "dist/_astro/" "s3://$BUCKET/_astro/" \
  --cache-control "public, max-age=31536000, immutable" \
  $PROFILE_ARG

echo "Deploy complete: http://$BUCKET.s3-website-us-east-1.amazonaws.com"
