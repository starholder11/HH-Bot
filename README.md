# HH Bot Chat

A Next.js chat application that integrates with OpenAI's Responses API and file search capabilities.

## Features

- 🤖 Real-time chat with AI assistant
- 📁 File search integration using OpenAI vector stores
- 🎨 Modern, responsive UI with dark mode support
- ⚡ Streaming responses for better user experience
- 🔒 Secure API key management

## Prerequisites

- Node.js 18+ 
- OpenAI API key with access to Responses API
- A configured prompt and vector store in OpenAI (IDs are configured in the code)

## Setup Instructions

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Environment Configuration:**
   - Copy `.env.example` to `.env.local`
   - Add your OpenAI API key:
     ```
     OPENAI_API_KEY=your_openai_api_key_here
     ```

3. **Configure OpenAI Integration:**
   - The app is pre-configured with specific prompt and vector store IDs
   - Update these in `app/api/chat/route.ts` if needed:
     ```typescript
     const PROMPT_ID = "pmpt_6860145bd5908196b230e507ed5d77a604ffb6d8d850b993"
     const VECTOR_STORE_ID = "vs_6860128217f08191bacd30e1475d8566"
     ```

4. **Run the development server:**
   ```bash
   npm run dev
   ```

5. **Open your browser:**
   Navigate to [http://localhost:3000](http://localhost:3000)

## Deployment to Vercel

1. **Push to Git:**
   ```bash
   git add .
   git commit -m "Initial chat app setup"
   git push origin main
   ```

2. **Deploy to Vercel:**
   - Connect your repository to Vercel
   - Add environment variables in Vercel dashboard:
     - `OPENAI_API_KEY`: Your OpenAI API key
   - Deploy automatically on git push

## Project Structure

```
├── app/
│   ├── api/chat/route.ts     # OpenAI API integration
│   ├── globals.css           # Global styles
│   ├── layout.tsx           # Root layout
│   └── page.tsx             # Home page
├── components/
│   └── Chat.tsx             # Main chat component
├── .env.local               # Environment variables (not committed)
├── .env.example             # Environment template
└── README.md                # This file
```

## How It Works

1. **Frontend (Chat.tsx):**
   - Manages chat state and UI
   - Sends messages to `/api/chat` endpoint
   - Handles streaming responses for real-time display

2. **Backend (app/api/chat/route.ts):**
   - Receives chat messages
   - Integrates with OpenAI Responses API
   - Streams responses back to frontend
   - Maintains conversation history via `previous_response_id`

3. **OpenAI Integration:**
   - Uses specified prompt ID for consistent behavior
   - Leverages file search with your vector store
   - Supports conversation continuity

## Customization

- **Styling:** Modify Tailwind classes in components
- **Prompt:** Update the prompt ID or create new prompts in OpenAI dashboard
- **Vector Store:** Change the vector store ID to use different document sets
- **UI/UX:** Customize the chat interface in `components/Chat.tsx`

## Environment Variables

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | Your OpenAI API key |
| `NEXT_PUBLIC_APP_URL` | Your application URL (for production) |

## Troubleshooting

- **API Key Issues:** Ensure your OpenAI API key has access to the Responses API
- **Streaming Problems:** Check network configuration and CORS settings
- **Prompt/Vector Store Errors:** Verify IDs are correct and accessible with your API key 

## TinaCMS Content Management (Local Mode)

This project uses TinaCMS in local/self-hosted mode for content management.

### How the Admin Interface Works
- The TinaCMS admin interface at `/admin` provides full visual editing capabilities.
- Content is stored as markdown files in the `/content` directory.
- Changes are made through the visual editor and saved to files.

### Local Development
1. **Run the development server with TinaCMS:**
   ```bash
   npm run dev
   ```
   This starts both TinaCMS dev server and Next.js together.

2. **Access the admin interface:**
   - Visit [http://localhost:3000/admin](http://localhost:3000/admin) for the full TinaCMS admin interface.

### Production (Vercel)
- The `postbuild` script automatically builds the TinaCMS admin interface.
- The admin interface is available at `/admin` on your deployed site.
- Content changes are made through the visual editor.

### Content Editing
- Use the full TinaCMS admin interface at `/admin` for visual content editing.
- All content is stored in the `/content` directory as markdown files.
- Changes are committed to your git repository and deployed automatically. 