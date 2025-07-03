import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <header className="text-center mb-8">
            <h1 className="text-4xl font-bold text-slate-800 dark:text-slate-200 mb-2">
              Hyperreal Hospitality
            </h1>
            <p className="text-slate-600 dark:text-slate-400">
              A retreat and sanctuary on the digital frontier
            </p>
          </header>
          
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 p-8 text-center">
            <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-200 mb-4">
              Content Coming Soon
            </h2>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              We're preparing our knowledge base and content library. 
              In the meantime, you can chat with our AI assistant to explore the Starholder timeline.
            </p>
            <Link 
              href="/chat" 
              className="inline-flex items-center px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors"
            >
              Start Chatting
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
} 