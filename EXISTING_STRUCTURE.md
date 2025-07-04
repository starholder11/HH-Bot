# EXISTING PROJECT STRUCTURE - Current State Before Keystatic

## Current File Structure
Based on the existing HH-Bot project with TinaCMS that needs to be replaced:

```
HH-Bot/
├── app/
│   ├── api/
│   │   └── chat/
│   │       └── route.ts           # ✅ WORKING - OpenAI chatbot API
│   ├── chat/
│   │   └── page.tsx               # ✅ WORKING - Chatbot interface  
│   ├── timeline/
│   │   └── [slug]/
│   │       └── page.tsx           # ✅ WORKING - Timeline content display
│   ├── globals.css                # ✅ WORKING - Global styles
│   ├── layout.tsx                 # ✅ WORKING - Root layout
│   └── page.tsx                   # ✅ WORKING - Homepage with content/chat nav
├── components/
│   └── Chat.tsx                   # ✅ WORKING - Main chatbot component
├── content/
│   └── timeline/
│       └── first-milestone.md     # ✅ WORKING - Sample timeline content
├── public/                        # ✅ WORKING - Static assets
├── tina/                          # ❌ BROKEN - TinaCMS config (to be removed)
├── pages/api/tina/               # ❌ BROKEN - TinaCMS API routes (to be removed)
├── .env.local                     # ⚠️ NEEDS UPDATE - Remove TinaCMS vars
├── .env.example                   # ⚠️ NEEDS UPDATE - Remove TinaCMS vars  
├── next.config.js                 # ✅ WORKING - Next.js configuration
├── package.json                   # ⚠️ NEEDS UPDATE - Remove TinaCMS, add Keystatic
├── tailwind.config.js             # ✅ WORKING - Tailwind configuration
└── tsconfig.json                  # ✅ WORKING - TypeScript configuration
```

## Working Functionality ✅
These features are currently working and must be preserved:

### Chatbot System
- **Route**: `/chat` 
- **API**: `/api/chat` (OpenAI integration)
- **Component**: `Chat.tsx`
- **Functionality**: Users can chat with AI, get responses

### Content Display
- **Route**: `/timeline/[slug]`
- **Content**: Markdown files in `content/timeline/`
- **Sample**: `first-milestone.md` displays at `/timeline/first-milestone`
- **Functionality**: Timeline entries render with rich text

### Site Navigation
- **Homepage**: Links to both timeline and chat
- **Layout**: Proper navigation between sections
- **Styling**: Tailwind CSS working correctly

## Broken/Problematic Areas ❌
These need to be completely replaced with Keystatic:

### TinaCMS Integration
- **Admin Interface**: Non-functional authentication
- **Configuration**: `tina/config.js` causing issues
- **API Routes**: `pages/api/tina/` broken auth
- **Dependencies**: TinaCMS packages causing deployment issues

### Environment Variables
- TinaCMS-related variables that don't work
- Redis variables that may not be needed with Keystatic
- Authentication secrets that need to be updated

## Content Structure 📝
Current content format that should be preserved:

### Timeline Entries
```markdown
---
title: "Project Launch"
slug: "first-milestone" 
date: "2024-01-15"
---

# Project Launch

Welcome to our project! This is the first milestone in our journey.

Here we can add rich text content including:
- Bullet points
- Links  
- And more formatting
```

### URL Structure
- Content accessible at `/timeline/[slug]`
- Clean URLs without file extensions
- SEO-friendly structure

## Deployment Configuration 🚀

### Working Aspects
- **Vercel deployment**: Basic Next.js app deploys successfully
- **Environment variables**: Core app variables work
- **Build process**: Next.js build succeeds when TinaCMS removed

### Problem Areas  
- **TinaCMS dependencies**: Cause build failures
- **Authentication**: Broken in production
- **Database connections**: Redis setup that may not be needed

## Current User Flow 👥

### Working Flow
1. User visits homepage
2. Can navigate to `/chat` for AI conversation
3. Can navigate to `/timeline/first-milestone` to view content
4. Both sections work independently

### Broken Flow
1. User tries to access `/admin` 
2. Gets TinaCMS authentication errors
3. Cannot manage content through admin interface

## Migration Goals 🎯

### What to Keep
- All working chatbot functionality
- Content display at `/timeline/[slug]`
- Existing content files and format
- Navigation and styling

### What to Replace
- TinaCMS admin interface → Keystatic admin at `/keystatic`
- TinaCMS configuration → `keystatic.config.tsx`
- TinaCMS dependencies → Keystatic packages
- Broken authentication → Working Keystatic auth

### What to Add
- Keystatic admin route at `/keystatic/[[...params]]`
- Working content management interface
- Proper authentication for admin access
- AI integration preparation

## Success Criteria ✅
After Keystatic implementation:
- [ ] Chatbot still works at `/chat`
- [ ] Content still displays at `/timeline/[slug]`
- [ ] Admin interface works at `/keystatic` with auth
- [ ] Content manageable through visual interface
- [ ] Deploys successfully to Vercel
- [ ] Ready for AI content generation pipeline
