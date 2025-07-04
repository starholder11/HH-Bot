
## Project Overview
We are adding content management to an existing Next.js chatbot application to create an AI-powered knowledge base multiplication system. The existing chatbot MUST remain fully functional throughout this process.

## What we're building:
- Adding content management to existing Next.js chatbot
- Creating AI content generation pipeline
- Establishing feedback loop between CMS and OpenAI vector store
- Preserving ALL existing chatbot functionality

## Current Project Structure (DO NOT MODIFY):
├── app/
│ ├── api/chat/route.ts # EXISTING OpenAI chatbot - DO NOT TOUCH
│ ├── page.tsx # EXISTING home page with chatbot
│ ├── layout.tsx # EXISTING root layout
│ └── globals.css # EXISTING global styles
├── components/
│ └── Chat.tsx # EXISTING chatbot component - DO NOT TOUCH
├── .env.local # EXISTING environment variables
├── .env.example # EXISTING template
└── README.md # EXISTING documentation

## Technology Stack:
- **Framework**: Next.js 14 (existing)
- **CMS**: Markdown-based content management
- **Deployment**: Vercel (existing setup)
- **Styling**: Tailwind CSS (existing)
- **AI Integration**: OpenAI API (existing)
- **Media Storage**: AWS S3 (to be added)
- **Content Storage**: Git-based markdown files

## Critical Constraints:
- **PRESERVE existing chatbot functionality** - move to `/chat` page, don't break it
- **NEVER modify components/Chat.tsx** - just move it to a new page
- **NEVER modify app/api/chat/route.ts** - API stays the same
- **SAFELY modify app/page.tsx** - transform from chatbot to content homepage
- **ALWAYS test locally** before considering a task complete
- **ALWAYS preserve existing environment variables** and add new ones

## Architecture Goals:
- `/` = New content homepage (articles/blog)
- `/chat` = Existing chatbot (moved to dedicated page)
- `/admin` = Content management interface (future)
- `/content/` = New content directory for articles
- `/tina/` = Content configuration (future)

## File Creation Rules:
- Content files go in `/content/posts/`
- Content config goes in `/lib/content-manager.ts`
- Admin interface at `/app/admin/page.tsx`
- Chatbot moves to `/app/chat/page.tsx`
- Homepage becomes content display at `/app/page.tsx`
- New API routes for content sync at `/app/api/content/`

## OpenAI Integration Context:
- Existing vector store ID: `vs_6860128217f08191bacd30e1475d8566`
- Existing prompt ID: `pmpt_6860145bd5908196b230e507ed5d77a604ffb6d8d850b993`
- These will be used for content synchronization

## Success Criteria for Each Task:
- [ ] `npm run dev` works without errors
- [ ] Existing chatbot at `/` functions perfectly
- [ ] No TypeScript compilation errors
- [ ] No console errors in browser
- [ ] Git status is clean (no unintended file modifications)
