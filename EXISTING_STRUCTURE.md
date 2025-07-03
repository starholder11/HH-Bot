# EXISTING PROJECT STRUCTURE - Current State

## File Structure (as of current state):
HH-Bot/
├── app/
│   ├── api/
│   │   └── chat/
│   │       └── route.ts          # OpenAI API integration - DO NOT MODIFY
│   ├── favicon.ico
│   ├── globals.css               # Global styles - SAFE TO EXTEND
│   ├── layout.tsx                # Root layout - SAFE TO EXTEND
│   └── page.tsx                  # Home page with chatbot - WILL BE MODIFIED
├── components/
│   └── Chat.tsx                  # Main chatbot component - DO NOT MODIFY
├── .env.example                  # Environment template - SAFE TO EXTEND
├── .env.local                    # Local environment (not in git)
├── .gitignore
├── next.config.js
├── package.json                  # SAFE TO ADD DEPENDENCIES
├── README.md                     # SAFE TO UPDATE
├── tailwind.config.js            # SAFE TO EXTEND
└── tsconfig.json                 # SAFE TO EXTEND

## Key Existing Functionality:
- **Chat Interface**: Full-featured chatbot with streaming responses
- **OpenAI Integration**: Uses specific prompt and vector store IDs
- **Environment Variables**: OPENAI_API_KEY configured
- **Styling**: Tailwind CSS with dark mode support
- **Deployment**: Configured for Vercel

## Existing Dependencies (from package.json):
- Next.js 14
- React 18
- OpenAI SDK
- Tailwind CSS
- TypeScript

## Environment Variables Currently Used:
- `OPENAI_API_KEY` - Required for chatbot functionality
- `NEXT_PUBLIC_APP_URL` - Optional for production

## Deployment Configuration:
- Vercel deployment configured
- Auto-deploy on git push to main branch
- Environment variables configured in Vercel dashboard
