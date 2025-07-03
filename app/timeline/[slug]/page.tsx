import { getTimelineEntry, getTimelineEntries } from '@/lib/timeline'
import Link from 'next/link'
import { notFound } from 'next/navigation'

interface PageProps {
  params: {
    slug: string
  }
}

export async function generateStaticParams() {
  const timelineEntries = getTimelineEntries()
  return timelineEntries.map((entry) => ({
    slug: entry.slug,
  }))
}

export default function TimelineEntryPage({ params }: PageProps) {
  const entry = getTimelineEntry(params.slug)

  if (!entry) {
    notFound()
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <Link 
              href="/" 
              className="inline-flex items-center text-blue-500 hover:text-blue-600 transition-colors"
            >
              ← Back to Timeline
            </Link>
          </div>
          
          <article className="bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 p-8">
            <header className="mb-6">
              <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-200 mb-2">
                {entry.title}
              </h1>
              <time className="text-slate-500 dark:text-slate-400">
                {new Date(entry.date).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </time>
            </header>
            
            <div className="prose prose-lg dark:prose-invert max-w-none">
              <div dangerouslySetInnerHTML={{ __html: entry.body }} />
            </div>
          </article>
        </div>
      </div>
    </main>
  )
} 