# PROJECT RULES - READ FIRST BEFORE ANY IMPLEMENTATION

## Project Overview
We are implementing Keystatic CMS in an existing Next.js chatbot application to create an AI-powered content multiplication system. The goal is to create a feedback loop where AI generates content based on existing knowledge base articles.

## Technology Stack - KEYSTATIC FOCUSED
- **CMS**: Keystatic (git-based, truly self-hosted)
- **Frontend**: Next.js 14 (App Router)
- **AI Integration**: OpenAI API
- **Deployment**: Vercel
- **Content Storage**: Git-based markdown files (required for AI integration)
- **Authentication**: Keystatic built-in authentication

## Architecture Overview
- **Frontend**: Next.js app serving both chatbot and content
- **Content Management**: Keystatic admin interface at /keystatic
- **Content Storage**: Markdown files in /content/timeline/
- **AI Pipeline**: OpenAI reads markdown files → generates new content → saves as new markdown
- **Chatbot**: Existing OpenAI integration at /chat

## Critical Requirements
1. **Git-based content storage** - Essential for OpenAI file search integration
2. **Working authentication** - Admin must be protected
3. **Vercel deployment** - Must work on serverless platform
4. **AI feedback loop** - Content must be accessible to OpenAI for content generation

## CRITICAL CONSTRAINTS
- **NEVER modify**: app/api/chat/route.ts, components/Chat.tsx
- **PRESERVE**: All existing chatbot functionality
- **MAINTAIN**: Git-based content storage (essential for AI)
- **ENSURE**: Working authentication (no open admin)
- **TEST**: Vercel deployment compatibility

## Success Criteria
- [ ] Keystatic admin accessible at /keystatic with authentication
- [ ] Timeline content manageable through admin interface
- [ ] Content stored as markdown files in git repository
- [ ] Existing chatbot functionality preserved at /chat
- [ ] AI can read/write content files for content generation
- [ ] Deploys successfully to Vercel
