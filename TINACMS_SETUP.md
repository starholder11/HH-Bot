# TinaCMS Self-Hosted Setup

## Environment Variables Required

Add these to your `.env.local` file:

```bash
TINA_PUBLIC_IS_LOCAL=false
KV_REST_API_URL=https://pleasing-sunbeam-16087.upstash.io
KV_REST_API_TOKEN=AT7XAAIjcDE0N2NiZDNmODBlNTI0MzU4YmZkODkzZDZkOGIwMDY1Y3AxMA
GITHUB_OWNER=starholder11
GITHUB_REPO=HH-Bot
GITHUB_BRANCH=main
GITHUB_PERSONAL_ACCESS_TOKEN=your_github_token_here
NEXTAUTH_SECRET=your_nextauth_secret_here
```

## Installation Steps

1. **Install Dependencies** (when npm is available):
```bash
npm install @tinacms/datalayer tinacms-gitprovider-github tinacms-authjs upstash-redis-level @upstash/redis
```

2. **Generate TinaCMS Client**:
```bash
npx tinacms init
```

3. **Set up GitHub Personal Access Token**:
   - Go to GitHub Settings > Developer settings > Personal access tokens
   - Create a new token with `repo` permissions
   - Replace `your_github_token_here` in `.env.local`

4. **Set up NextAuth Secret**:
   - Generate a random string for NEXTAUTH_SECRET
   - Replace `your_nextauth_secret_here` in `.env.local`

## Files Created/Updated

- ✅ `tina/database.ts` - Database configuration with GitHub provider and Redis
- ✅ `pages/api/tina/[...routes].ts` - API route handler
- ✅ `tina/config.js` - Updated with proper configuration
- ✅ `package.json` - Updated scripts and dependencies
- ✅ `app/admin/[[...slug]]/page.tsx` - Admin interface

## Usage

- **Development**: `npm run dev` (runs TinaCMS dev server + Next.js)
- **Build**: `npm run build` (builds TinaCMS + Next.js)
- **Admin Interface**: Visit `/admin` for visual content editing

## Current Status

- ✅ Configuration files created
- ✅ Dependencies added to package.json
- ⏳ Dependencies need to be installed (npm not available in current environment)
- ⏳ Environment variables need to be set
- ⏳ GitHub token needs to be configured 