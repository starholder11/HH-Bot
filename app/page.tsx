import Link from 'next/link'
import { getTimelineEntries } from '@/lib/timeline'

export default function Home() {
  const timelineEntries = getTimelineEntries()

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
          
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 p-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-200">
                Timeline
              </h2>
              <Link 
                href="/chat" 
                className="inline-flex items-center px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors text-sm"
              >
                Chat with AI
              </Link>
            </div>
            
            {timelineEntries.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-slate-600 dark:text-slate-400 mb-4">
                  No timeline entries yet. Check back soon for updates!
                </p>
                <Link 
                  href="/admin" 
                  className="inline-flex items-center px-4 py-2 bg-green-500 hover:bg-green-600 text-white font-medium rounded-lg transition-colors text-sm"
                >
                  Add Content
                </Link>
              </div>
            ) : (
              <div className="space-y-6">
                {timelineEntries.map((entry) => (
                  <div key={entry.slug} className="border-l-4 border-blue-500 pl-6 py-4">
                    <div className="flex justify-between items-start mb-2">
                      <Link 
                        href={`/timeline/${entry.slug}`}
                        className="text-lg font-semibold text-slate-800 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                      >
                        {entry.title}
                      </Link>
                      <time className="text-sm text-slate-500 dark:text-slate-400">
                        {new Date(entry.date).toLocaleDateString()}
                      </time>
                    </div>
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <div dangerouslySetInnerHTML={{ __html: entry.body }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
} 