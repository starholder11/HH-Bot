# HH-Bot Keystatic Deployment Guide

## ✅ Current Working State

**Local Development**: Fully operational
- ✅ Keystatic admin accessible at `http://localhost:3000/keystatic`
- ✅ Timeline entries editable via admin interface
- ✅ Chat functionality preserved at `http://localhost:3000/chat`
- ✅ File structure: `content/timeline/<slug>.yaml` + `content/timeline/<slug>/body.mdoc`
- ✅ Configuration: `path: 'content/timeline/*'` with `slugField: 'slug'`

## 🚀 Production Deployment Checklist

### 1. Environment Variables Required

Create these environment variables in Vercel dashboard:

```bash
# OpenAI Configuration (REQUIRED)
OPENAI_API_KEY=your_openai_api_key_here

# Keystatic GitHub Authentication (REQUIRED for production)
KEYSTATIC_GITHUB_CLIENT_ID=your_github_oauth_app_client_id
KEYSTATIC_GITHUB_CLIENT_SECRET=your_github_oauth_app_client_secret
KEYSTATIC_SECRET=your_random_secret_key_32_chars_min

# GitHub API Access (REQUIRED for webhooks and search)
GITHUB_TOKEN=your_github_personal_access_token
GITHUB_WEBHOOK_SECRET=your_webhook_secret

# AWS S3 Configuration (REQUIRED for image uploads)
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=us-east-1
AWS_S3_BUCKET=hh-bot-images-2025-prod
AWS_CLOUDFRONT_DOMAIN=drbs5yklwtho3.cloudfront.net

# Application URLs
NEXT_PUBLIC_APP_URL=https://your-domain.vercel.app
```

### 2. GitHub OAuth App Setup

1. Go to GitHub Settings > Developer settings > OAuth Apps
2. Create new OAuth App with:
   - **Application name**: HH-Bot Keystatic Admin
   - **Homepage URL**: `https://your-domain.vercel.app`
   - **Authorization callback URL**: `https://your-domain.vercel.app/api/keystatic/github/oauth/callback`
3. Copy Client ID and Client Secret to environment variables

### 3. GitHub Personal Access Token

1. Go to GitHub Settings > Developer settings > Personal access tokens
2. Create token with these permissions:
   - `repo` (full repository access)
   - `workflow` (if using GitHub Actions)
3. Copy token to `GITHUB_TOKEN` environment variable

### 4. Vercel Deployment

```bash
# Deploy to Vercel
npm run build  # Test build locally first
vercel --prod  # Deploy to production
```

### 5. Post-Deployment Verification

Test these URLs after deployment:
- `https://your-domain.vercel.app` - Homepage
- `https://your-domain.vercel.app/chat` - Chat interface
- `https://your-domain.vercel.app/keystatic` - Admin interface (requires GitHub login)
- `https://your-domain.vercel.app/api/search-index` - Search index API

## 🔧 Configuration Details

### File Structure
```
content/timeline/
├── <slug>.yaml          # Entry metadata
└── <slug>/              # Entry folder
    └── body.mdoc        # Entry content
```

### Keystatic Configuration
- **Path**: `content/timeline/*`
- **Slug Field**: `slug`
- **Storage**: GitHub (production) / Local (development)
- **Authentication**: GitHub OAuth (production only)

### Key Features
- ✅ Git-based content storage
- ✅ GitHub authentication for admin access
- ✅ Real-time content editing
- ✅ Image upload to S3/CloudFront
- ✅ Webhook integration for AI sync
- ✅ Search index generation

## 🚨 Troubleshooting

### Common Issues

**1. "Entry not found" errors**
- Ensure file structure matches: `content/timeline/<slug>.yaml` + `content/timeline/<slug>/body.mdoc`
- Check that `slug` field exists in YAML files

**2. Authentication issues in production**
- Verify GitHub OAuth app callback URL matches deployment URL
- Check that `KEYSTATIC_SECRET` is at least 32 characters
- Ensure GitHub OAuth app has correct permissions

**3. Search index 401 errors**
- Add `GITHUB_TOKEN` environment variable
- Ensure token has `repo` permissions
- This is non-critical for core functionality

**4. Image upload failures**
- Verify AWS credentials and S3 bucket access
- Check CloudFront distribution settings
- Ensure CORS is configured on S3 bucket

### Emergency Rollback

If deployment fails:
```bash
git revert HEAD  # Revert last commit
vercel --prod    # Redeploy previous version
```

## 📝 Maintenance

### Regular Tasks
- Monitor webhook logs for sync issues
- Check OpenAI vector store usage
- Review AWS S3 storage costs
- Update dependencies monthly

### Backup Strategy
- Git repository serves as primary backup
- OpenAI vector store contains processed content
- S3 bucket contains uploaded media

## 🎯 Success Metrics

Deployment is successful when:
- ✅ Admin accessible with GitHub authentication
- ✅ Content editable and saves to git
- ✅ Chat responds using timeline content
- ✅ Images upload to S3 successfully
- ✅ Webhooks sync content to OpenAI
- ✅ Search functionality works

---

**Last Updated**: July 8, 2025
**Configuration Version**: Working Keystatic Setup v1.0
**Tested**: Local development ✅ | Production deployment ⏳ 