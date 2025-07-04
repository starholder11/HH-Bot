# FILES TO NEVER MODIFY - Critical Preservation List

## Core Chatbot Files - NEVER MODIFY:
- `app/api/chat/route.ts` - OpenAI API integration
- `components/Chat.tsx` - Main chatbot component

## Environment Files - NEVER MODIFY:
- `.env.local` - Contains critical API keys
- `.env.example` - Template for environment setup

## Configuration Files - MODIFY WITH EXTREME CAUTION:
- `next.config.js` - Only add to it, never remove existing config
- `tailwind.config.js` - Only extend, never replace existing config
- `tsconfig.json` - Only add to it, never modify existing settings

## Deployment Files - NEVER MODIFY:
- `vercel.json` (if it exists)
- `.github/workflows/` (if it exists)

## Content Files - NEVER MODIFY:
- `README.md` - Only add to it, never replace existing content

## Safe to Extend (But Don't Break):
- `app/layout.tsx` - Can add new imports/providers
- `app/globals.css` - Can add new styles
- `package.json` - Can add new dependencies

## Files That Will Be Modified:
- `app/page.tsx` - Will be transformed from chatbot to content homepage
- `README.md` - Will be updated to reflect new structure

## Safe to Create:
- Anything in `/content/`
- Content configuration files (future)
- New files in `/app/admin/`
- New files in `/app/api/content/`
- New component files in `/components/`
- New style files in `/styles/`

## Emergency Recovery:
If you accidentally modify a protected file:
1. `git checkout HEAD -- [filename]` to restore
2. `npm run dev` to verify functionality
3. Review this list before proceeding
