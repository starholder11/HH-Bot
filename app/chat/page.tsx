import Chat from '@/components/Chat'

export default function ChatPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <header className="text-center mb-8">
            <h1 className="text-4xl font-bold text-slate-800 dark:text-slate-200 mb-2">
              HH Bot Chat
            </h1>
            <p className="text-slate-600 dark:text-slate-400">
              Chat with your AI assistant powered by OpenAI
            </p>
          </header>
          <Chat />
        </div>
      </div>
    </main>
  )
} 