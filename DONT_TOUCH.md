# FILES TO NEVER MODIFY - Critical Preservation List

## Core Chatbot Files - NEVER MODIFY:
- `app/api/chat/route.ts` - OpenAI API integration for chatbot
- `components/Chat.tsx` - Main chatbot component
- `app/chat/page.tsx` - Chatbot page (current working implementation)

## Core App Structure - PRESERVE:
- `app/layout.tsx` - Root layout (modify only to add navigation)
- `next.config.js` - Next.js configuration
- `tailwind.config.js` - Tailwind configuration
- `tsconfig.json` - TypeScript configuration
- `package.json` - Only modify to remove TinaCMS and add Keystatic packages

## Environment Files - HANDLE CAREFULLY:
- `.env.local` - Remove TinaCMS variables, add Keystatic if needed
- `.env.example` - Update to reflect new Keystatic setup
- `.gitignore` - Ensure proper git exclusions

## Existing Content - PRESERVE AND MIGRATE:
- `content/timeline/` directory structure
- All existing timeline markdown files
- Content format and frontmatter (adapt for Keystatic if needed)

## Validation Checklist
Before considering any implementation complete:
- [ ] Chatbot accessible at `/chat`
- [ ] Chatbot responds to user input
- [ ] Timeline content displays properly
- [ ] No TypeScript compilation errors
- [ ] No runtime errors in browser console
- [ ] Vercel deployment succeeds

## Emergency Rollback Plan
If modifications break existing functionality:
1. Revert to last working git commit
2. Restore protected files from backup
3. Remove Keystatic additions
4. Verify chatbot functionality
5. Start implementation again with more caution
